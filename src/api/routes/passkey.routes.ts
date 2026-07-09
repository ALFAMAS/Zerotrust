import crypto from "node:crypto";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../config";
import { getDb } from "../../db";
import {
  completePasskeyAuthentication,
  registerPasskey,
} from "../../db/repositories/passkeys.repository";
import { organizationMembersTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { KNOWN_HARDWARE_KEY_AAGUIDS, verifyAttestation } from "../../mfa/attestation";
import { authMiddleware } from "../../middleware/auth";
import { getSettings } from "../../services/shared/saasSettings.service";
import {
  getOrgSecurityPolicy,
  toAttestationPolicy,
} from "../../services/auth/orgSecurityPolicy.service";
import { TokenService } from "../../services/auth/token.service";
import { getClientIp } from "../../shared/clientIp";
import { hashTokenSha256 } from "../../shared/cryptoHash";
import { internalError } from "../../shared/httpErrors";
import type { HonoEnv, Passkey } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("passkey-routes");

let _tokenService: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (_tokenService) return _tokenService;
  const cfg = getConfig();
  _tokenService = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await _tokenService.init();
  return _tokenService;
}

function hashToken(token: string): string {
  return hashTokenSha256(token);
}

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function storeChallenge(key: string, challenge: string): void {
  challengeStore.set(key, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(key);
    return null;
  }
  challengeStore.delete(key);
  return entry.challenge;
}

function storeAuthChallenge(key: string, challenge: string): void {
  challengeStore.set(`auth:${key}`, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

function consumeAuthChallenge(key: string): string | null {
  return consumeChallenge(`auth:${key}`);
}

function registrationChallengeKey(userId: string, orgId?: string): string {
  return orgId ? `${userId}:${orgId}` : userId;
}

async function assertOrgMembership(orgId: string, userId: string): Promise<void> {
  const db = getDb();
  const [member] = await db
    .select({ id: organizationMembersTable.id })
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  if (!member) {
    throw new Error("ORG_MEMBERSHIP_REQUIRED");
  }
}

// POST /register/options — auth required
router.post("/register/options", authMiddleware, async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" }, 403);
    }

    const user = c.get("user");
    const userId = user.id;
    const { orgId } = await c.req.json().catch(() => ({}));
    if (orgId) {
      await assertOrgMembership(orgId, userId);
    }
    const policy = orgId ? await getOrgSecurityPolicy(orgId) : null;
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");

    const existingPasskeys = user.passkeys || [];
    const excludeCredentials = existingPasskeys.map((pk) => ({
      id: pk.credentialId,
      type: "public-key" as const,
      transports: pk.transports as AuthenticatorTransportFuture[],
    }));

    const options = await generateRegistrationOptions({
      rpName: settings.appName || "zerotrust",
      rpID: new URL(settings.appUrl || "http://localhost:3000").hostname,
      userID: Buffer.from(userId),
      userName: user.email,
      userDisplayName: user.displayName,
      attestationType: policy?.requirePasskeyAttestation ? "direct" : "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    storeChallenge(registrationChallengeKey(userId, orgId), options.challenge);
    return c.json(options);
  } catch (err) {
    if ((err as Error).message === "ORG_MEMBERSHIP_REQUIRED") {
      return c.json({ error: "FORBIDDEN", message: "Not a member of this organization" }, 403);
    }
    return internalError(
      c,
      logger,
      "Passkey register options error",
      err,
      "Failed to generate options"
    );
  }
});

// POST /register/verify — auth required
router.post("/register/verify", authMiddleware, async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" }, 403);
    }

    const user = c.get("user");
    const userId = user.id;
    const body = await c.req.json();
    const orgId = typeof body?.orgId === "string" ? body.orgId : undefined;
    if (orgId) {
      await assertOrgMembership(orgId, userId);
    }
    const policy = orgId ? await getOrgSecurityPolicy(orgId) : null;

    const expectedChallenge = consumeChallenge(registrationChallengeKey(userId, orgId));
    if (!expectedChallenge) {
      return c.json(
        {
          error: "CHALLENGE_EXPIRED",
          message: "Registration challenge expired or not found",
        },
        400
      );
    }

    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const appUrl = settings.appUrl || "http://localhost:3000";
    const rpID = new URL(appUrl).hostname;

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: appUrl,
        expectedRPID: rpID,
      });
    } catch (verifyErr) {
      logger.warn("Passkey registration verification failed", {
        error: String(verifyErr),
      });
      return c.json(
        {
          error: "VERIFICATION_FAILED",
          message: "Registration verification failed",
        },
        400
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      return c.json({ error: "VERIFICATION_FAILED", message: "Registration not verified" }, 400);
    }

    const { registrationInfo } = verification;
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    const aaguid = registrationInfo.aaguid
      ? String(registrationInfo.aaguid).toLowerCase()
      : undefined;

    if (policy) {
      const attestationResult = verifyAttestation(
        {
          fmt: registrationInfo.fmt ?? "none",
          aaguid,
          userVerified: Boolean(registrationInfo.userVerified),
        },
        toAttestationPolicy(policy)
      );
      const isKnownHardware = aaguid ? KNOWN_HARDWARE_KEY_AAGUIDS[aaguid] !== undefined : false;
      if (!attestationResult.passed || (policy.requireHardwarePasskey && !isKnownHardware)) {
        return c.json(
          {
            error: "PASSKEY_POLICY_FAILED",
            message: attestationResult.reason ?? "Passkey does not satisfy organization policy",
            aaguid,
          },
          400
        );
      }
    }

    const newPasskey = {
      // credential.id is already a Base64URLString in @simplewebauthn/server v13;
      // wrapping it in Buffer.from() would re-encode the string and corrupt the id.
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body?.response?.transports || [],
      name: body.name || "Passkey",
      orgId,
      aaguid,
      attestationFormat: registrationInfo.fmt,
      createdAt: new Date(),
    };

    await registerPasskey(userId, newPasskey);

    return c.json({ verified: true });
  } catch (err) {
    if ((err as Error).message === "ORG_MEMBERSHIP_REQUIRED") {
      return c.json({ error: "FORBIDDEN", message: "Not a member of this organization" }, 403);
    }
    return internalError(
      c,
      logger,
      "Passkey register verify error",
      err,
      "Registration verification failed"
    );
  }
});

// POST /authenticate/options — public
router.post("/authenticate/options", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" }, 403);
    }

    const { email } = await c.req.json();
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const appUrl = settings.appUrl || "http://localhost:3000";
    const rpID = new URL(appUrl).hostname;

    let allowCredentials: {
      id: string;
      type: "public-key";
      transports?: AuthenticatorTransportFuture[];
    }[] = [];
    if (email) {
      const db = getDb();
      const userRows = await db
        .select({ passkeys: usersTable.passkeys })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      const passkeys = (userRows[0]?.passkeys as Passkey[] | null) || [];
      allowCredentials = passkeys.map((pk) => ({
        id: pk.credentialId,
        type: "public-key" as const,
        transports: pk.transports as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials,
    });
    const challengeKey = email || `anon:${crypto.randomBytes(8).toString("hex")}`;
    storeAuthChallenge(challengeKey, options.challenge);

    return c.json({ ...options, _challengeKey: challengeKey });
  } catch (err) {
    return internalError(
      c,
      logger,
      "Passkey auth options error",
      err,
      "Failed to generate options"
    );
  }
});

// POST /authenticate/verify — public
router.post("/authenticate/verify", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" }, 403);
    }

    const body = await c.req.json();
    const { email, challengeKey } = body;
    const key = challengeKey || email;
    if (!key) {
      return c.json({ error: "INVALID_REQUEST", message: "email or challengeKey required" }, 400);
    }

    const expectedChallenge = consumeAuthChallenge(key);
    if (!expectedChallenge) {
      return c.json(
        {
          error: "CHALLENGE_EXPIRED",
          message: "Authentication challenge expired",
        },
        400
      );
    }

    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const appUrl = settings.appUrl || "http://localhost:3000";
    const rpID = new URL(appUrl).hostname;
    const credentialId = body?.id || body?.rawId;

    if (!credentialId) {
      return c.json({ error: "INVALID_REQUEST", message: "credentialId required" }, 400);
    }

    const db = getDb();
    const allUsers = await db.select().from(usersTable);
    let user: (typeof allUsers)[0] | null = null;
    let passkey: Passkey | null = null;

    for (const u of allUsers) {
      const pks = (u.passkeys as Passkey[] | null) || [];
      const pk = pks.find((p) => p.credentialId === credentialId);
      if (pk) {
        user = u;
        passkey = pk;
        break;
      }
    }

    if (!user || !passkey) {
      return c.json(
        {
          error: "PASSKEY_NOT_FOUND",
          message: "No user found for this passkey",
        },
        401
      );
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
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
    } catch (verifyErr) {
      logger.warn("Passkey authentication verification failed", {
        error: String(verifyErr),
      });
      return c.json(
        {
          error: "VERIFICATION_FAILED",
          message: "Authentication verification failed",
        },
        401
      );
    }

    if (!verification.verified) {
      return c.json(
        {
          error: "VERIFICATION_FAILED",
          message: "Authentication not verified",
        },
        401
      );
    }

    const updatedPasskeys = ((user.passkeys as Passkey[] | null) || []).map((pk) =>
      pk.credentialId === credentialId
        ? {
            ...pk,
            counter: verification.authenticationInfo.newCounter,
            lastUsedAt: new Date(),
          }
        : pk
    );

    const cfg = getConfig();
    const tokenSvc = await getTokenService();
    const sessionId = crypto.randomUUID();

    const accessToken = await tokenSvc.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: sessionId,
      aud: "zerotrust",
      scope: ["openid"],
    });
    const payload = await tokenSvc.verifyAccessToken(accessToken);
    const refreshTokenPlain = await tokenSvc.signRefreshToken();

    await completePasskeyAuthentication({
      userId: user.id,
      updatedPasskeys,
      session: {
        id: sessionId,
        userId: user.id,
        tokenId: payload.jti,
        deviceFingerprint: {},
        ipAddress: getClientIp(c),
        userAgent: c.req.header("user-agent"),
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      },
      refreshToken: {
        userId: user.id,
        tokenHash: hashToken(refreshTokenPlain),
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      },
    });

    return c.json({
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Passkey auth verify error", err as Error);
    return c.json(
      {
        error: "INTERNAL_ERROR",
        message: "Authentication verification failed",
      },
      500
    );
  }
});

export default router;
