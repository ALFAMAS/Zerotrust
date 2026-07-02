import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { generateNumericCode } from "../../crypto/codes.js";
import { getDb } from "../../db/index.js";
import { otpsTable, usersTable } from "../../db/schema.js";
import { getLogger } from "../../logger/index.js";
import { authMiddleware } from "../../middleware/auth.js";
import { getVerification, recordVerification } from "../../middleware/continuousVerification.js";
import { sendOtpEmail } from "../../services/notifications/email.service.js";
import type { HonoEnv } from "../../shared/types.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("verification-routes");

router.use("*", authMiddleware);

// Challenge store for passkey re-verification
const authChallengeStore = new Map<string, { challenge: string; expiresAt: number }>();
function storeChallenge(key: string, challenge: string) {
  authChallengeStore.set(key, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
}
function consumeChallenge(key: string): string | null {
  const e = authChallengeStore.get(key);
  if (!e || Date.now() > e.expiresAt) {
    authChallengeStore.delete(key);
    return null;
  }
  authChallengeStore.delete(key);
  return e.challenge;
}

// POST /auth/verify/challenge
router.post("/challenge", async (c) => {
  try {
    const user = c.get("user");
    const session = c.get("session");
    const { type = "totp" } = (await c.req.json()) as { type?: string };

    if (type === "passkey") {
      const passkeys = user.passkeys ?? [];
      if (passkeys.length === 0) {
        return c.json({ error: "NO_PASSKEYS", message: "No passkeys registered" }, 400);
      }
      const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
      const { getSettings } = await import("../../models/settings.model.js");
      const settings = await getSettings();
      const rpID = new URL(settings.appUrl || "http://localhost:3000").hostname;
      const allowCredentials = passkeys.map((pk) => ({
        id: pk.credentialId,
        type: "public-key" as const,
        transports: (pk.transports ?? []) as AuthenticatorTransportFuture[],
      }));
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials,
      });
      storeChallenge(`verify:${session.id}`, options.challenge);
      return c.json({ type: "passkey", options, _challengeKey: `verify:${session.id}` });
    }

    if (type === "otp") {
      const code = generateNumericCode(6);
      const db = getDb();
      await db
        .delete(otpsTable)
        .where(and(eq(otpsTable.userId, user.id), eq(otpsTable.type, "reverification")));
      await db.insert(otpsTable).values({
        userId: user.id,
        code,
        type: "reverification",
        channel: "email",
        target: user.email,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      // Deliver the code to the user's registered email. sendOtpEmail is
      // best-effort (it never throws); in dev/test the no-op mail transport
      // simply logs instead of sending.
      await sendOtpEmail(user.email, {
        name: (user.displayName as string) || user.email,
        code,
        expiresInMinutes: 10,
      });
      logger.info("Re-verification OTP sent", { userId: user.id });
      return c.json({
        type: "otp",
        channel: "email",
        message: "OTP sent to your registered email",
      });
    }

    // Default: totp
    return c.json({ type: "totp", message: "Enter your authenticator code" });
  } catch (err) {
    logger.warn("Challenge generation failed", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /auth/verify/respond
router.post("/respond", async (c) => {
  try {
    const user = c.get("user");
    const session = c.get("session");
    const body = (await c.req.json()) as { type?: string; code?: string; response?: unknown };
    const type = body.type ?? "totp";

    if (type === "passkey") {
      const expectedChallenge = consumeChallenge(`verify:${session.id}`);
      if (!expectedChallenge) return c.json({ error: "CHALLENGE_EXPIRED" }, 400);

      const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
      const { getSettings } = await import("../../models/settings.model.js");
      const settings = await getSettings();
      const appUrl = settings.appUrl || "http://localhost:3000";
      const rpID = new URL(appUrl).hostname;

      const responseIdentifier = body.response as { id?: string; rawId?: string } | undefined;
      const credentialId = responseIdentifier?.id ?? responseIdentifier?.rawId;
      if (!credentialId)
        return c.json({ error: "INVALID_REQUEST", message: "credentialId required" }, 400);

      const passkeys = user.passkeys ?? [];
      const passkey = passkeys.find((p) => p.credentialId === credentialId);
      if (!passkey) return c.json({ error: "PASSKEY_NOT_FOUND" }, 401);

      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyAuthenticationResponse({
          response: body.response as AuthenticationResponseJSON,
          expectedChallenge,
          expectedOrigin: appUrl,
          expectedRPID: rpID,
          credential: {
            id: passkey.credentialId,
            publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
            counter: passkey.counter,
            transports: passkey.transports as AuthenticatorTransportFuture[],
          },
        });
      } catch {
        return c.json({ error: "VERIFICATION_FAILED" }, 401);
      }

      if (!verification.verified) return c.json({ error: "VERIFICATION_FAILED" }, 401);

      const updatedPasskeys = passkeys.map((pk) =>
        pk.credentialId === credentialId
          ? { ...pk, counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() }
          : pk
      );
      const db = getDb();
      await db
        .update(usersTable)
        .set({ passkeys: updatedPasskeys, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));

      recordVerification(session.id, "hard");
      return c.json({ verified: true, level: "hard" });
    }

    if (type === "otp") {
      const { code } = body;
      if (!code) return c.json({ error: "INVALID_REQUEST", message: "code required" }, 400);
      const db = getDb();
      const otpRows = await db
        .select()
        .from(otpsTable)
        .where(
          and(
            eq(otpsTable.userId, user.id),
            eq(otpsTable.type, "reverification"),
            eq(otpsTable.code, code),
            gt(otpsTable.expiresAt, new Date())
          )
        )
        .limit(1);
      if (otpRows.length === 0) return c.json({ error: "INVALID_CODE" }, 401);
      await db.delete(otpsTable).where(eq(otpsTable.id, otpRows[0].id));
      recordVerification(session.id, "soft");
      return c.json({ verified: true, level: "soft" });
    }

    // TOTP
    const { code } = body;
    if (!code) return c.json({ error: "INVALID_REQUEST", message: "code required" }, 400);
    const mfa = user.mfa;
    if (!mfa?.totp?.enabled || !mfa.totp.secret) {
      return c.json({ error: "TOTP_NOT_ENABLED" }, 400);
    }
    try {
      const { TOTP, Secret } = await import("otpauth");
      const totp = new TOTP({ secret: Secret.fromBase32(mfa.totp.secret), digits: 6, period: 30 });
      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) return c.json({ error: "INVALID_CODE" }, 401);
    } catch {
      return c.json({ error: "TOTP_UNAVAILABLE", message: "TOTP verification not available" }, 503);
    }
    recordVerification(session.id, "soft");
    return c.json({ verified: true, level: "soft" });
  } catch (err) {
    logger.warn("Verification response failed", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /auth/verify/status
router.get("/status", (c) => {
  const session = c.get("session");
  const rec = getVerification(session.id);
  if (!rec) {
    return c.json({ sessionId: session.id, verified: false });
  }
  const expiresAt = new Date(rec.verifiedAt + 30 * 60 * 1000).toISOString();
  return c.json({
    sessionId: session.id,
    verified: true,
    level: rec.level,
    verifiedAt: new Date(rec.verifiedAt).toISOString(),
    expiresAt,
  });
});

export default router;
