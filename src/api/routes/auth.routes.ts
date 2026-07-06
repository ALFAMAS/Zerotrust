import * as nodeCrypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { and, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getConfig } from "../../config";
import { generateNumericCode } from "../../crypto/codes";
import { getDb } from "../../db";
import {
  revokeRefreshTokenFamily,
  revokeSessionAtLogout,
  rotateRefreshToken,
} from "../../db/repositories/authSessions.repository";
import { otpsTable, refreshTokensTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import {
  getLoginThrottle,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../../middleware/accountLockout";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth";
import { sensitiveReverification } from "../../middleware/continuousVerification";
import {
  isIpBlocked,
  recordIpLoginFailure,
  recordIpLoginSuccess,
} from "../../middleware/credentialStuffing";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { captchaGuard } from "../../middleware/captcha";
import { rateLimit } from "../../middleware/rateLimiting";
import { zValidator } from "../../middleware/zodValidation";
import { getSettings } from "../../models/settings.model";
import { recordAndRespond } from "../../services/auth/accountTakeover.service";
import { validateSignupEmail } from "../../services/auth/disposableEmail.service";
import { issueAuthenticatedSession } from "../../services/auth/issueAuthenticatedSession.service";
import { recordLoginFailure, recordLoginSuccess } from "../../services/auth/loginAudit.service";
import { rejectIfBreached } from "../../services/auth/passwordBreach.service";
import {
  createPowChallenge,
  isSignupPowEnabled,
  verifyPowSolution,
} from "../../services/auth/proofOfWork.service";
import { TokenService } from "../../services/auth/token.service";
import { invalidateUserCache } from "../../services/auth/userStateCache.service";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
} from "../../services/notifications/email.service";
import {
  deleteObject,
  isS3BackupEnabled,
  parseObjectKeyFromPublicUrl,
  uploadBuffer,
} from "../../services/ops/objectStorage.service";
import {
  clearRefreshTokenCookie,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from "../../shared/authCookies";
import { getClientIp } from "../../shared/clientIp";
import { hashTokenSha256, safeDigestEquals } from "../../shared/cryptoHash";
import { internalError } from "../../shared/httpErrors";
import { localeFromAcceptLanguage, normalizeLocale, SUPPORTED_LOCALES } from "../../shared/locale";
import {
  dummyPasswordHash,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../../shared/passwordHash";
import type { HonoEnv, OAuthProvider, Passkey, User } from "../../shared/types";
import { LoginBodySchema, RegisterBodySchema } from "../schemas/auth.schema";

const router = new Hono<HonoEnv>();
const logger = getLogger("auth-routes");

let tokenServiceInstance: TokenService | null = null;
async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

function hashToken(token: string) {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

// ── MFA second-factor at login ───────────────────────────────────────────────

// Audience/scope that tag the short-lived token handed out when a password is
// correct but MFA is still pending. It is intentionally NOT a session token: no
// session row is created for it, so it cannot satisfy `authMiddleware` (which
// requires an active session) even though it is signed with the same key.
const MFA_CHALLENGE_AUD = "mfa";
const MFA_CHALLENGE_SCOPE = "mfa:challenge";
const MFA_CHALLENGE_TTL_SECS = 300;

/** Upgrade legacy bcrypt password hashes to argon2id after a successful login. */
async function rehashPasswordIfLegacy(
  userId: string,
  password: string,
  storedHash: string
): Promise<void> {
  if (!passwordNeedsRehash(storedHash)) return;
  const db = getDb();
  const passwordHash = await hashPassword(password);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

/** A user must clear a second factor at login once TOTP is verified+enabled. */
function userRequiresMfa(user: { mfa?: unknown }): boolean {
  return (user.mfa as { totp?: { enabled?: boolean } } | undefined)?.totp?.enabled === true;
}

/** Mint the short-lived token that ties the pending login to the verified user. */
async function issueMfaChallengeToken(user: { id: string; email: string }): Promise<string> {
  const tokenSvc = await getTokenService();
  return tokenSvc.signAccessToken(
    {
      sub: user.id,
      email: user.email,
      sid: "mfa-pending",
      aud: MFA_CHALLENGE_AUD,
      scope: [MFA_CHALLENGE_SCOPE],
    },
    MFA_CHALLENGE_TTL_SECS
  );
}

/** Verify a TOTP code against the user's stored secret. */
async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    const { TOTP, Secret } = await import("otpauth");
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    return totp.validate({ token: code, window: 1 }) !== null;
  } catch (err) {
    logger.error("TOTP verify error during login", err as Error);
    return false;
  }
}

/**
 * Create a session + token pair for an authenticated user and return the login
 * response body. Shared by the no-MFA path and the post-MFA path so both mint
 * identical sessions.
 */
const EMAIL_VERIFICATION_TTL_MIN = 30;

/**
 * Generate a fresh 6-digit email-verification code, persist it (replacing any
 * prior one for the user), and send the verification email. The email contains
 * both the code and a magic link to /verify-email carrying the code (the verify
 * page is authenticated and reads the email from the session).
 */
async function issueVerification(user: {
  id: string;
  email: string;
  displayName?: string | null;
  locale?: string | null;
}) {
  const db = getDb();
  const code = generateNumericCode(6);
  await db
    .delete(otpsTable)
    .where(and(eq(otpsTable.userId, user.id), eq(otpsTable.type, "email_verification")));
  await db.insert(otpsTable).values({
    userId: user.id,
    code: hashTokenSha256(code),
    type: "email_verification",
    channel: "email",
    target: user.email,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MIN * 60 * 1000),
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  // The verify page is authenticated and reads the email from the session, so the
  // magic link only needs to carry the code.
  const verifyUrl = `${appUrl}/verify-email?code=${code}`;
  void sendVerificationEmail(user.email, {
    name: user.displayName ?? user.email,
    code,
    verifyUrl,
    expiresInMinutes: EMAIL_VERIFICATION_TTL_MIN,
    locale: normalizeLocale(user.locale),
  });
}

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

// POST /login
router.post(
  "/login",
  rateLimit({ points: 20, windowSecs: 60 }),
  captchaGuard(),
  zValidator("json", LoginBodySchema),
  async (c) => {
    try {
      const { email, password, powChallenge, powSolution } = c.req.valid("json");

      const settings = await getSettings();
      const backoffSettings = {
        enabled: settings.accountLockoutEnabled,
        powThreshold: settings.accountLockoutThreshold,
        maxDelayMinutes: settings.accountLockoutDurationMinutes,
      };

      const throttle = getLoginThrottle(email, backoffSettings);
      if (throttle.delayed && throttle.retryAfterSeconds) {
        c.header("Retry-After", String(throttle.retryAfterSeconds));
        return c.json(
          {
            error: "TOO_MANY_ATTEMPTS",
            message: "Too many failed login attempts. Please wait before trying again.",
            retryAfter: throttle.retryAfterSeconds,
            requiresPow: throttle.requiresPow,
          },
          429
        );
      }

      if (throttle.requiresPow) {
        const pow = verifyPowSolution(powChallenge ?? "", powSolution ?? "");
        if (!pow.ok) {
          return c.json(
            {
              error: "POW_REQUIRED",
              message: "Proof-of-work required after repeated failed login attempts",
              reason: pow.reason,
              requiresPow: true,
            },
            428
          );
        }
      }

      // Credential-stuffing defense: block a source IP that has been failing logins
      // across many accounts, independent of any single account's backoff.
      const clientIp = getClientIp(c);
      const ipBlock = isIpBlocked(clientIp);
      if (ipBlock.blocked) {
        if (ipBlock.retryAfterSecs) c.header("Retry-After", String(ipBlock.retryAfterSecs));
        return c.json(
          {
            error: "TOO_MANY_ATTEMPTS",
            message: "Too many failed login attempts from this network. Try again later.",
            retryAfter: ipBlock.retryAfterSecs,
          },
          429
        );
      }

      const db = getDb();
      // Select only fields required for password login. This keeps login working
      // when optional profile/compliance columns have not been migrated yet.
      const users = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          passwordHash: usersTable.passwordHash,
          displayName: usersTable.displayName,
          mfa: usersTable.mfa,
        })
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase()))
        .limit(1);
      const user = users[0];
      const hashToVerify = user?.passwordHash ?? (await dummyPasswordHash());
      const valid = await verifyPassword(password, hashToVerify);
      if (!user?.passwordHash || !valid) {
        recordFailedLogin(email, backoffSettings);
        recordIpLoginFailure(clientIp, email);
        recordLoginFailure({
          email: email.toLowerCase(),
          ip: clientIp,
          reason: "invalid_credentials",
          userId: user?.id,
        });
        return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
      }

      recordSuccessfulLogin(email);
      recordIpLoginSuccess(clientIp);
      await rehashPasswordIfLegacy(user.id, password, user.passwordHash);

      // Password is correct, but if the account has a second factor we stop here
      // and hand back a short-lived challenge token instead of a real session.
      // The caller must clear the second factor via POST /login/mfa.
      if (userRequiresMfa(user)) {
        const mfaToken = await issueMfaChallengeToken(user);
        return c.json({
          mfaRequired: true,
          mfaToken,
          methods: ["totp"],
          expiresIn: MFA_CHALLENGE_TTL_SECS,
        });
      }

      const { body, sessionId } = await issueAuthenticatedSession(c, user);
      recordLoginSuccess({
        userId: user.id,
        email: user.email,
        ip: clientIp,
        method: "password",
        sessionId,
      });
      return c.json(body);
    } catch (err) {
      return internalError(c, logger, "Login error", err, "Login failed");
    }
  }
);

// POST /login/mfa — complete a login that requires a second factor.
// Exchanges a valid TOTP code (or one-time backup code) + the challenge token
// from POST /login for a real session.
router.post("/login/mfa", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  try {
    const { mfaToken, code } = await c.req.json();
    if (!mfaToken || !code) {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: "mfaToken and code are required",
        },
        400
      );
    }

    const tokenSvc = await getTokenService();
    let payload: Awaited<ReturnType<TokenService["verifyAccessToken"]>>;
    try {
      payload = await tokenSvc.verifyAccessToken(mfaToken);
    } catch {
      return c.json(
        {
          error: "MFA_TOKEN_INVALID",
          message: "Invalid or expired MFA token",
        },
        401
      );
    }

    if (payload.aud !== MFA_CHALLENGE_AUD || !payload.scope?.includes(MFA_CHALLENGE_SCOPE)) {
      return c.json({ error: "MFA_TOKEN_INVALID", message: "Not an MFA challenge token" }, 401);
    }

    const db = getDb();
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        mfa: usersTable.mfa,
      })
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub))
      .limit(1);
    const user = users[0];
    if (!user) {
      return c.json(
        {
          error: "MFA_TOKEN_INVALID",
          message: "Invalid or expired MFA token",
        },
        401
      );
    }

    const mfa = (user.mfa as User["mfa"] | null) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };
    if (mfa?.totp?.enabled !== true || !mfa?.totp?.secret) {
      // The challenge was issued but TOTP was since removed — nothing to verify.
      return c.json(
        {
          error: "MFA_NOT_ENABLED",
          message: "MFA is not enabled for this account",
        },
        400
      );
    }

    const submitted = String(code).trim();
    let verified = await verifyTotpCode(mfa.totp.secret, submitted);

    // Fall back to a one-time backup code (stored as sha256 hashes).
    if (!verified && Array.isArray(mfa.totp.backupCodes) && mfa.totp.backupCodes.length > 0) {
      const submittedHash = hashToken(submitted.replace(/[\s-]/g, "").toLowerCase());
      const idx = mfa.totp.backupCodes.indexOf(submittedHash);
      if (idx !== -1) {
        verified = true;
        const remaining = mfa.totp.backupCodes.filter((_: string, i: number) => i !== idx);
        await db
          .update(usersTable)
          .set({
            mfa: { ...mfa, totp: { ...mfa.totp, backupCodes: remaining } },
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, user.id));
      }
    }

    if (!verified) {
      const clientIp = getClientIp(c);
      recordLoginFailure({
        email: user.email,
        ip: clientIp,
        reason: "invalid_mfa_code",
        userId: user.id,
      });
      return c.json({ error: "INVALID_CODE", message: "Invalid MFA code" }, 401);
    }

    const clientIp = getClientIp(c);
    const { body, sessionId } = await issueAuthenticatedSession(c, user);
    recordLoginSuccess({
      userId: user.id,
      email: user.email,
      ip: clientIp,
      method: "mfa",
      sessionId,
    });
    return c.json(body);
  } catch (err) {
    return internalError(c, logger, "Login MFA error", err, "MFA verification failed");
  }
});

// POST /token/refresh
router.post(
  "/token/refresh",
  rateLimit({ points: 20, windowSecs: 60 }),
  requireProofOfPossession(),
  async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const refreshToken = readRefreshTokenFromRequest(c, body.refreshToken);
      if (!refreshToken) {
        return c.json({ error: "INVALID_REQUEST", message: "refreshToken required" }, 400);
      }

      const tokenHash = hashToken(refreshToken);
      const db = getDb();

      const rtRows = await db
        .select()
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.tokenHash, tokenHash))
        .limit(1);
      const rt = rtRows[0];
      if (!rt || rt.expiresAt < new Date()) {
        return c.json({ error: "TOKEN_INVALID", message: "Invalid refresh token" }, 401);
      }

      // Refresh-token reuse detection: an already-rotated (revoked) token is
      // being presented again. This is the canonical signal of a stolen refresh
      // token — the legitimate client and the attacker each try to redeem it.
      // Fail closed for the whole account: revoke every refresh token and active
      // session so both parties are forced to re-authenticate.
      if (rt.isRevoked) {
        logger.warn("Refresh token reuse detected — revoking session family", {
          userId: rt.userId,
        });
        await revokeRefreshTokenFamily(rt.familyId, "refresh_token_reuse");
        return c.json(
          {
            error: "TOKEN_REUSE_DETECTED",
            message: "This session has been ended for your security. Please sign in again.",
          },
          401
        );
      }

      const cfg = getConfig();
      const tokenSvc = await getTokenService();

      const userRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, rt.userId))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
      }

      const [oldSession] = await db
        .select({ activeOrgId: sessionsTable.activeOrgId })
        .from(sessionsTable)
        .where(eq(sessionsTable.id, rt.sessionId))
        .limit(1);

      const popKey = c.req.header("x-pop-key") || undefined;
      const newSessionId = crypto.randomUUID();

      const accessToken = await tokenSvc.signAccessToken({
        sub: user.id,
        email: user.email,
        sid: newSessionId,
        aud: "zerotrust",
        scope: ["openid"],
        pop_key: popKey,
      });
      const payload = await tokenSvc.verifyAccessToken(accessToken);
      const newRefreshPlain = await tokenSvc.signRefreshToken();
      const newRefreshHash = hashToken(newRefreshPlain);

      await rotateRefreshToken({
        oldRefreshTokenId: rt.id,
        session: {
          id: newSessionId,
          userId: user.id,
          tokenId: payload.jti,
          deviceFingerprint: {},
          ipAddress: getClientIp(c),
          userAgent: c.req.header("user-agent"),
          expiresAt: new Date(payload.exp * 1000),
          lastActivityAt: new Date(),
          isActive: true,
          activeOrgId: oldSession?.activeOrgId ?? null,
        },
        refreshToken: {
          userId: user.id,
          tokenHash: newRefreshHash,
          expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
          familyId: rt.familyId,
        },
      });

      setRefreshTokenCookie(c, newRefreshPlain, cfg.session.refreshTokenTTL);

      return c.json({
        accessToken,
        expiresIn: cfg.session.defaultTTL,
        tokenType: "Bearer",
      });
    } catch (err) {
      return internalError(c, logger, "Refresh token error", err, "Refresh failed");
    }
  }
);

// POST /logout — revoke server-side session + refresh token, then clear cookie (ADR 008)
router.post("/logout", optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = readRefreshTokenFromRequest(c, body.refreshToken);
    await revokeSessionAtLogout({
      sessionId: c.get("session")?.id,
      refreshTokenPlain: refreshToken,
    });
    clearRefreshTokenCookie(c);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "Logout error", err);
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get("/me", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const db = getDb();
    const [row] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        roles: usersTable.roles,
        status: usersTable.status,
        phone: usersTable.phone,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
        emailVerifiedAt: usersTable.emailVerifiedAt,
        metadata: usersTable.metadata,
        locale: usersTable.locale,
        version: usersTable.version,
        mfa: usersTable.mfa,
        passkeys: usersTable.passkeys,
        oauthProviders: usersTable.oauthProviders,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!row) return c.json({ error: "USER_NOT_FOUND" }, 404);

    // Sanitize sensitive auth material before returning to the client: never
    // expose the TOTP secret, backup-code hashes, or passkey public keys.
    const rawMfa = (row.mfa as User["mfa"] | null) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };
    const mfa = {
      totp: {
        enabled: rawMfa.totp?.enabled === true,
        verifiedAt: rawMfa.totp?.verifiedAt ?? null,
        backupCodesRemaining: Array.isArray(rawMfa.totp?.backupCodes)
          ? rawMfa.totp.backupCodes.length
          : 0,
      },
      webauthn: { enabled: rawMfa.webauthn?.enabled === true },
    };
    const passkeys = ((row.passkeys as Passkey[] | null) ?? []).map((pk) => ({
      credentialId: pk.credentialId,
      name: pk.name ?? "Passkey",
      deviceType: pk.deviceType,
      aaguid: pk.aaguid,
      backedUp: pk.backedUp,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt ?? null,
    }));
    const oauthProviders = ((row.oauthProviders as OAuthProvider[] | null) ?? []).map((p) => ({
      provider: p.provider,
      email: p.email,
      connectedAt: p.connectedAt,
    }));

    const { mfa: _m, passkeys: _p, oauthProviders: _o, ...rest } = row;
    return c.json({
      ...rest,
      emailVerified: row.emailVerifiedAt != null,
      activeOrgId: c.get("activeOrgId") ?? c.get("session")?.activeOrgId ?? null,
      mfa,
      passkeys,
      oauthProviders,
    });
  } catch (err) {
    return internalError(c, logger, "Get current user error", err);
  }
});

// ── PATCH /auth/me ────────────────────────────────────────────────────────────

const patchMeSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, hyphens, underscores only")
    .nullable()
    .optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  version: z.number().int().nonnegative().optional(),
});

router.patch("/me", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const { version: expectedVersion, ...fields } = parsed.data;
    const db = getDb();
    const setPayload = { ...fields, updatedAt: new Date() };

    const returningFields = {
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      roles: usersTable.roles,
      status: usersTable.status,
      phone: usersTable.phone,
      locale: usersTable.locale,
      version: usersTable.version,
      updatedAt: usersTable.updatedAt,
    };

    if (expectedVersion !== undefined) {
      const [updated] = await db
        .update(usersTable)
        .set({ ...setPayload, version: sql`${usersTable.version} + 1` })
        .where(and(eq(usersTable.id, user.id), eq(usersTable.version, expectedVersion)))
        .returning(returningFields);
      if (!updated) {
        return c.json(
          {
            error: "VERSION_CONFLICT",
            message: "Profile was modified elsewhere; refresh and retry",
          },
          409
        );
      }
      await invalidateUserCache(user.id);
      return c.json(updated);
    }

    const [updated] = await db
      .update(usersTable)
      .set({ ...setPayload, version: sql`${usersTable.version} + 1` })
      .where(eq(usersTable.id, user.id))
      .returning(returningFields);
    if (!updated) return c.json({ error: "USER_NOT_FOUND" }, 404);
    await invalidateUserCache(user.id);
    return c.json(updated);
  } catch (err) {
    return internalError(c, logger, "Patch current user error", err);
  }
});

// ── POST /auth/me/onboarding-complete ──────────────────────────────────────────
// Fires an analytics/Slack event when the user finishes the setup checklist.
// Idempotent: repeated calls are no-ops (tracked via users.metadata).
router.post("/me/onboarding-complete", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const db = getDb();

    const [row] = await db
      .select({ metadata: usersTable.metadata })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    // Idempotent: already marked complete.
    const metadata = row?.metadata as { onboardingCompletedAt?: string } | null | undefined;
    if (metadata?.onboardingCompletedAt) {
      return c.json({ success: true, alreadyCompleted: true });
    }

    await db
      .update(usersTable)
      .set({
        metadata: {
          ...(row?.metadata ?? {}),
          onboardingCompletedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    // Fire notification (Slack / Teams / PagerDuty) — non-blocking.
    const { notificationDispatcher } = await import("../../notifications/dispatcher.js");
    void notificationDispatcher.dispatch("onboarding.completed", {
      userId: user.id,
      email: user.email,
      displayName: user.displayName ?? user.email,
    });

    return c.json({ success: true });
  } catch (err) {
    logger.error("Onboarding complete error", err as Error);
    return c.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to mark onboarding complete",
      },
      500
    );
  }
});

// ── NPS survey ────────────────────────────────────────────────────────────────

// GET /auth/me/nps/should-prompt — check if user should see NPS survey
router.get("/me/nps/should-prompt", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { shouldPromptNps } = await import("../../services/ops/nps.service.js");
    const should = await shouldPromptNps(user.id);
    return c.json({ shouldPrompt: should });
  } catch (err) {
    logger.error("NPS should-prompt error", err as Error);
    return c.json({ shouldPrompt: false });
  }
});

// POST /auth/me/nps — submit NPS feedback
router.post("/me/nps", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { score, comment, context } = await c.req.json().catch(() => ({}));
    if (typeof score !== "number" || score < 0 || score > 10) {
      return c.json({ error: "INVALID_REQUEST", message: "score must be 0-10" }, 400);
    }
    const { recordNpsFeedback } = await import("../../services/ops/nps.service.js");
    await recordNpsFeedback(user.id, score, comment, context);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "NPS submit error", err);
  }
});

// ── POST /auth/me/email — change email (requires current password) ───────────

router.post(
  "/me/email",
  authMiddleware,
  sensitiveReverification,
  rateLimit({ points: 5, windowSecs: 60 }),
  async (c) => {
    try {
      const user = c.get("user");
      const { newEmail, password } = await c.req.json().catch(() => ({}));
      if (!newEmail || !password) {
        return c.json(
          {
            error: "INVALID_REQUEST",
            message: "newEmail and password required",
          },
          400
        );
      }

      const db = getDb();
      const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      if (!row?.passwordHash) {
        return c.json(
          {
            error: "REAUTH_REQUIRED",
            message: "Password verification required",
          },
          403
        );
      }

      const valid = await verifyPassword(password, row.passwordHash);
      if (!valid) {
        return c.json({ error: "INVALID_CREDENTIALS", message: "Incorrect password" }, 401);
      }
      await rehashPasswordIfLegacy(user.id, password, row.passwordHash);

      const normalized = String(newEmail).toLowerCase().trim();
      const [taken] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, normalized))
        .limit(1);
      if (taken) {
        return c.json({ error: "EMAIL_TAKEN", message: "Email already in use" }, 409);
      }

      const previousEmail = row.email;
      await db
        .update(usersTable)
        .set({ email: normalized, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await invalidateUserCache(user.id);

      // Account takeover detection: email change shortly after a password
      // reset (or other sensitive change) revokes other sessions and alerts
      // both the old and new address.
      void recordAndRespond(user.id, "email_change", {
        email: normalized,
        previousEmail,
        displayName: row.displayName ?? normalized,
        ipAddress: getClientIp(c),
        userAgent: c.req.header("user-agent"),
      });

      return c.json({ success: true, email: normalized });
    } catch (err) {
      return internalError(c, logger, "Email change error", err);
    }
  }
);

// ── POST /auth/me/avatar ──────────────────────────────────────────────────────

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

router.post(
  "/me/avatar",
  authMiddleware,
  rateLimit({ points: 10, windowSecs: 3600 }),
  async (c) => {
    try {
      const user = c.get("user");
      const formData = await c.req.formData();
      const file = formData.get("avatar");

      if (!file || !(file instanceof File)) {
        return c.json({ error: "INVALID_REQUEST", message: "avatar file required" }, 400);
      }

      const ext = ALLOWED_AVATAR_TYPES[file.type];
      if (!ext) {
        return c.json(
          {
            error: "INVALID_TYPE",
            message: "Only JPEG, PNG, GIF, WebP images are allowed",
          },
          400
        );
      }

      if (file.size > MAX_AVATAR_BYTES) {
        return c.json({ error: "FILE_TOO_LARGE", message: "Avatar must be under 5 MB" }, 400);
      }

      const db = getDb();
      const buffer = Buffer.from(await file.arrayBuffer());
      const objectKey = `avatars/${user.id}-${Date.now()}.${ext}`;

      // Prefer S3 (same bucket as backups) when configured; fall back to the
      // legacy local-disk path when S3 isn't set so local dev keeps working.
      let avatarUrl: string;
      const s3Enabled = await isS3BackupEnabled();
      if (s3Enabled) {
        const result = await uploadBuffer({
          key: objectKey,
          body: buffer,
          contentType: file.type,
        });
        avatarUrl = result.url;
      } else {
        const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
        await fs.mkdir(uploadsDir, { recursive: true });
        const filename = `${user.id}-${Date.now()}.${ext}`;
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, buffer);
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        avatarUrl = `${appUrl}/uploads/avatars/${filename}`;
      }

      // Best-effort: clean up the previous S3 avatar so the bucket doesn't
      // accumulate dead objects. Failures are logged, not returned.
      const previous = await db
        .select({ avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      const oldUrl = previous[0]?.avatarUrl ?? null;
      if (oldUrl && oldUrl !== avatarUrl) {
        const oldKey = parseObjectKeyFromPublicUrl(oldUrl);
        if (oldKey) {
          try {
            await deleteObject(oldKey);
          } catch (err) {
            logger.warn("Failed to delete previous avatar from S3", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      await db
        .update(usersTable)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await invalidateUserCache(user.id);

      return c.json({ avatarUrl });
    } catch (err) {
      return internalError(c, logger, "Avatar upload error", err);
    }
  }
);

export default router;
