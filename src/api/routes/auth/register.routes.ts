import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../../config";
import { getDb } from "../../../db";
import { otpsTable, usersTable } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { captchaGuard } from "../../../middleware/captcha";
import { rateLimit } from "../../../middleware/rateLimiting";
import { zValidator } from "../../../middleware/zodValidation";
import { validateSignupEmail } from "../../../services/auth/disposableEmail.service";
import { rejectIfBreached } from "../../../services/auth/passwordBreach.service";
import {
  createPowChallenge,
  isSignupPowEnabled,
  verifyPowSolution,
} from "../../../services/auth/proofOfWork.service";
import { sendWelcomeEmail } from "../../../services/notifications/email.service";
import { hashTokenSha256, safeDigestEquals } from "../../../shared/cryptoHash";
import { internalError } from "../../../shared/httpErrors";
import { localeFromAcceptLanguage, normalizeLocale } from "../../../shared/locale";
import { hashPassword } from "../../../shared/passwordHash";
import type { HonoEnv } from "../../../shared/types";
import { RegisterBodySchema } from "../../schemas/auth.schema";
import { issueVerification, logger } from "./_shared";

const router = new Hono<HonoEnv>();
// GET /pow/challenge — issue a proof-of-work challenge for signup (bot mitigation).
// Returns { enabled: false } when PoW is off so the client can skip it.
router.get("/pow/challenge", rateLimit({ points: 30, windowSecs: 60 }), (c) => {
  if (!isSignupPowEnabled()) return c.json({ enabled: false });
  const { challenge, difficulty, expiresAt } = createPowChallenge();
  return c.json({ enabled: true, challenge, difficulty, expiresAt });
});

// POST /register
router.post(
  "/register",
  rateLimit({ points: 10, windowSecs: 60 }),
  captchaGuard(),
  zValidator("json", RegisterBodySchema),
  async (c) => {
    try {
      const {
        email,
        password,
        displayName,
        locale: bodyLocale,
        powChallenge,
        powSolution,
      } = c.req.valid("json");

      // Bot/abuse mitigation: require a valid proof-of-work when enabled.
      if (isSignupPowEnabled()) {
        const pow = verifyPowSolution(powChallenge ?? "", powSolution ?? "");
        if (!pow.ok) {
          return c.json(
            {
              error: "POW_REQUIRED",
              message: "Proof-of-work challenge failed",
              reason: pow.reason,
            },
            400
          );
        }
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      const emailValidation = await validateSignupEmail(normalizedEmail);
      if (!emailValidation.allowed) {
        return c.json(
          { error: emailValidation.code, message: emailValidation.message },
          emailValidation.code === "INVALID_EMAIL" ? 400 : 422
        );
      }

      const db = getDb();
      const existing = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);
      if (existing.length > 0) {
        return c.json({ error: "USER_ALREADY_EXISTS", message: "User already exists" }, 409);
      }

      // HaveIBeenPwned breach check (k-anonymity — fails open on network errors)
      const breachMessage = await rejectIfBreached(password);
      if (breachMessage) {
        return c.json({ error: "PASSWORD_BREACHED", message: breachMessage }, 400);
      }

      const cfg = getConfig();
      const passwordHash = await hashPassword(password);

      // Preferred locale: explicit body value wins, else negotiate Accept-Language.
      const locale = bodyLocale
        ? normalizeLocale(bodyLocale)
        : localeFromAcceptLanguage(c.req.header("accept-language"));

      const [user] = await db
        .insert(usersTable)
        .values({
          email: normalizedEmail,
          passwordHash,
          displayName: displayName || normalizedEmail.split("@")[0],
          locale,
          roles: ["user"],
          attributes: {},
          mfa: {
            totp: { enabled: false, backupCodes: [] },
            webauthn: { enabled: false },
          },
          passkeys: [],
          oauthProviders: [],
          status: "active",
          sessionConfig: {
            maxDevices: cfg.session.maxConcurrentDevices,
            allowedCountries: cfg.geofencing.allowedCountries,
            allowedIpRanges: cfg.geofencing.allowedIpRanges,
            scheduleRestriction: {
              enabled: false,
              timezone: "UTC",
              allowedDays: [],
              allowedHoursStart: 0,
              allowedHoursEnd: 23,
            },
          },
        })
        .returning();

      const loginUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/login`;
      void sendWelcomeEmail(user.email, {
        name: user.displayName ?? user.email,
        loginUrl,
        locale,
      });

      // Kick off email verification (code + magic link). Non-fatal on failure.
      try {
        await issueVerification(user);
      } catch (e) {
        logger.warn("Failed to issue email verification on register", {
          error: String(e),
        });
      }

      return c.json({ success: true, userId: user.id }, 201);
    } catch (err) {
      return internalError(c, logger, "Registration error", err, "Registration failed");
    }
  }
);

// POST /verify-email — confirm ownership via emailed code (requires auth)
//
// Verification always happens for the currently signed-in user — registration
// auto-logs them in — so the email is taken from the session, never the request
// body. This prevents one account from being used to probe or verify another.
router.post(
  "/verify-email",
  authMiddleware,
  rateLimit({ points: 10, windowSecs: 60 }),
  async (c) => {
    try {
      const { code } = await c.req.json().catch(() => ({}));
      if (!code) {
        return c.json({ error: "INVALID_REQUEST", message: "code required" }, 400);
      }

      const authUser = c.get("user");
      const db = getDb();
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, authUser.id))
        .limit(1);
      if (!user) {
        return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
      }
      if (user.emailVerifiedAt) {
        return c.json({ success: true, alreadyVerified: true });
      }

      const [otp] = await db
        .select()
        .from(otpsTable)
        .where(
          and(
            eq(otpsTable.userId, user.id),
            eq(otpsTable.type, "email_verification"),
            gt(otpsTable.expiresAt, new Date())
          )
        )
        .limit(1);
      if (!otp || !safeDigestEquals(hashTokenSha256(String(code).trim()), otp.code)) {
        return c.json({ error: "INVALID_CODE", message: "Invalid or expired code" }, 400);
      }

      await db
        .update(usersTable)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await db
        .delete(otpsTable)
        .where(and(eq(otpsTable.userId, user.id), eq(otpsTable.type, "email_verification")));

      return c.json({ success: true });
    } catch (err) {
      return internalError(c, logger, "Email verification error", err, "Verification failed");
    }
  }
);

// POST /verify-email/resend — re-issue a verification email for the current user
router.post(
  "/verify-email/resend",
  authMiddleware,
  rateLimit({ points: 5, windowSecs: 300 }),
  async (c) => {
    try {
      const user = c.get("user");
      const db = getDb();
      const [row] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          emailVerifiedAt: usersTable.emailVerifiedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      if (!row) return c.json({ error: "USER_NOT_FOUND" }, 404);
      if (row.emailVerifiedAt) return c.json({ success: true, alreadyVerified: true });

      await issueVerification(row);
      return c.json({ success: true });
    } catch (err) {
      return internalError(c, logger, "Resend verification error", err);
    }
  }
);

export default router;
