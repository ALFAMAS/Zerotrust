import * as nodeCrypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getConfig } from "../../config";
import { generateNumericCode } from "../../crypto/codes";
import { getDb } from "../../db";
import {
  oauthExchangeCodesTable,
  otpsTable,
  refreshTokensTable,
  sessionsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  isIpBlocked,
  recordIpLoginFailure,
  recordIpLoginSuccess,
} from "../../middleware/credentialStuffing";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { rateLimit } from "../../middleware/rateLimiting";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import {
  buildAuthorizationUrl,
  isSupportedProvider,
  PROVIDER_META,
} from "../../oauth/authorize-url";
import { getProviderAdapter } from "../../oauth/provider.factory";
import { recordAndRespond } from "../../services/accountTakeover.service";
import { validateSignupEmail } from "../../services/disposableEmail.service";
import { sendVerificationEmail, sendWelcomeEmail } from "../../services/email.service";
import { FingerprintService } from "../../services/fingerprint.service";
import { notifyIfNewDevice } from "../../services/loginNotification.service";
import {
  deleteObject,
  isS3BackupEnabled,
  parseObjectKeyFromPublicUrl,
  uploadBuffer,
} from "../../services/objectStorage.service";
import { rejectIfBreached } from "../../services/passwordBreach.service";
import {
  createPowChallenge,
  isSignupPowEnabled,
  verifyPowSolution,
} from "../../services/proofOfWork.service";
import { TokenService } from "../../services/token.service";
import { getClientIp } from "../../shared/clientIp";
import { localeFromAcceptLanguage, normalizeLocale, SUPPORTED_LOCALES } from "../../shared/locale";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("auth-routes");

const OAUTH_STATE_TTL_SECS = 300; // 5 minutes

async function getAndVerifyOAuthState(
  state?: string
): Promise<{ ok: boolean; codeChallenge: string | null; codeVerifier: string | null }> {
  if (!state) return { ok: false, codeChallenge: null, codeVerifier: null };
  // Try Redis first
  try {
    const { getRedis } = await import("../../services/rateLimiter/redis.js");
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get(`oauth:state:${state}`);
      if (!raw) return { ok: false, codeChallenge: null, codeVerifier: null };
      await redis.del(`oauth:state:${state}`);
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > OAUTH_STATE_TTL_SECS * 1000)
        return { ok: false, codeChallenge: null, codeVerifier: null };
      return {
        ok: true,
        codeChallenge: parsed.codeChallenge || null,
        codeVerifier: parsed.codeVerifier || null,
      };
    }
  } catch {
    // Redis not available, fall through to memory
  }
  // Fallback: in-memory store
  const entry = oauthStateStore.get(state);
  if (!entry) return { ok: false, codeChallenge: null, codeVerifier: null };
  if (Date.now() - entry.ts > OAUTH_STATE_TTL_SECS * 1000) {
    oauthStateStore.delete(state);
    return { ok: false, codeChallenge: null, codeVerifier: null };
  }
  const challenge = (entry as any).codeChallenge || null;
  const verifier = (entry as any).codeVerifier || null;
  oauthStateStore.delete(state);
  return { ok: true, codeChallenge: challenge, codeVerifier: verifier };
}

// In-memory fallback for single-instance deployments.
// Bounded: entries auto-expire via TTL and a periodic sweep purges stale
// entries so the Map never grows without bound.
const oauthStateStore = new Map<
  string,
  { ts: number; codeChallenge?: string | null; codeVerifier?: string | null }
>();
const OAUTH_STATE_MAX_SIZE = 10_000;

// Periodic sweep every 60s to evict expired entries from the in-memory store.
const oauthStateCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - OAUTH_STATE_TTL_SECS * 1000;
  for (const [key, entry] of oauthStateStore) {
    if (entry.ts < cutoff) oauthStateStore.delete(key);
  }
}, 60_000);
// Allow the process to exit even if the timer is still registered.
if (oauthStateCleanupInterval.unref) oauthStateCleanupInterval.unref();

async function generateOAuthState(codeChallenge?: string, codeVerifier?: string): Promise<string> {
  const state = nanoid();
  const store = JSON.stringify({
    ts: Date.now(),
    codeChallenge: codeChallenge || null,
    codeVerifier: codeVerifier || null,
  });
  // Store in Redis if available (multi-instance safe), else fall back to memory
  try {
    const { getRedis } = await import("../../services/rateLimiter/redis.js");
    const redis = getRedis();
    if (redis) {
      await redis.setex(`oauth:state:${state}`, OAUTH_STATE_TTL_SECS, store);
      return state;
    }
  } catch {
    // Redis not available, fall through to memory
  }
  // Fallback: in-memory store with bounded size. If the cap is hit, evict the
  // oldest 25% of entries to make room (amortised cost, prevents OOM).
  if (oauthStateStore.size >= OAUTH_STATE_MAX_SIZE) {
    const entries = [...oauthStateStore.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const evictCount = Math.floor(OAUTH_STATE_MAX_SIZE * 0.25);
    for (let i = 0; i < evictCount; i++) oauthStateStore.delete(entries[i][0]);
  }
  oauthStateStore.set(state, JSON.parse(store));
  return state;
}
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

/** A user must clear a second factor at login once TOTP is verified+enabled. */
function userRequiresMfa(user: { mfa?: unknown }): boolean {
  return (user.mfa as any)?.totp?.enabled === true;
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
async function issueAuthenticatedSession(
  c: any,
  user: { id: string; email: string; displayName?: string | null }
) {
  const cfg = getConfig();
  const tokenSvc = await getTokenService();
  const db = getDb();

  const fpInput = FingerprintService.extractFromRequest({
    headers: Object.fromEntries(c.req.raw.headers as any),
    ip: getClientIp(c),
  });
  const fingerprint = FingerprintService.compute(fpInput);

  const popKey = c.req.header("x-pop-key") || undefined;
  const sessionId = nodeCrypto.randomUUID();

  const accessToken = await tokenSvc.signAccessToken({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    aud: "zeroauth",
    scope: ["openid"],
    pop_key: popKey,
  });
  const payload = await tokenSvc.verifyAccessToken(accessToken);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      userId: user.id,
      tokenId: payload.jti,
      deviceFingerprint: {
        ...fingerprint,
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: fpInput.ip,
      country: c.get("inferredCountry") || undefined,
      userAgent: c.req.header("user-agent"),
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
      proofOfPossessionKey: payload.pop_key,
    })
    .returning();

  const refreshTokenPlain = await tokenSvc.signRefreshToken();
  const refreshTokenHash = hashToken(refreshTokenPlain);
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    sessionId: session.id,
    tokenHash: refreshTokenHash,
    expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
  });

  await enforceMaxConcurrentDevices(user.id);

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  // Streak tracking + achievement checks — fire and forget, never blocks login.
  void (async () => {
    try {
      const { recordLogin } = await import("../../services/streak.service.js");
      const { unlockAchievement } = await import("../../services/achievement.service.js");
      const { awardPoints } = await import("../../services/points.service.js");

      const streak = await recordLogin(user.id);

      // First Login achievement
      await unlockAchievement(user.id, "first_login");

      // Power User achievement (7-day streak)
      if (streak.currentStreak >= 7) {
        await unlockAchievement(user.id, "power_user");
      }

      // Award daily login points
      await awardPoints({
        userId: user.id,
        amount: 10,
        reason: "daily_login",
        description: `Day ${streak.currentStreak} login streak`,
      });
    } catch (err) {
      logger.warn("Post-login streak/achievement error", { userId: user.id, error: String(err) });
    }
  })();

  // New-device alert email — fire and forget, never blocks the response
  void notifyIfNewDevice({
    userId: user.id,
    email: user.email,
    displayName: user.displayName ?? user.email,
    sessionId: session.id,
    fingerprintHash: fingerprint.hash,
    ipAddress: fpInput.ip,
    country: c.get("inferredCountry") || undefined,
    userAgent: c.req.header("user-agent"),
  });

  return {
    body: {
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    },
    // Exposed for callers (OAuth callback) that must persist the session id
    // alongside the issued tokens. Not part of the public login response.
    sessionId: session.id,
  };
}

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
    code,
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
router.post("/register", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  try {
    const {
      email,
      password,
      displayName,
      locale: bodyLocale,
      powChallenge,
      powSolution,
    } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "INVALID_REQUEST", message: "email and password required" }, 400);
    }

    // Bot/abuse mitigation: require a valid proof-of-work when enabled.
    if (isSignupPowEnabled()) {
      const pow = verifyPowSolution(powChallenge ?? "", powSolution ?? "");
      if (!pow.ok) {
        return c.json(
          { error: "POW_REQUIRED", message: "Proof-of-work challenge failed", reason: pow.reason },
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
    const passwordHash = await bcrypt.hash(password, cfg.security.bcryptRounds);

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
        mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
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
      logger.warn("Failed to issue email verification on register", { error: String(e) });
    }

    return c.json({ success: true, userId: user.id }, 201);
  } catch (err) {
    logger.error("Registration error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Registration failed" }, 500);
  }
});

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
            eq(otpsTable.code, String(code).trim()),
            gt(otpsTable.expiresAt, new Date())
          )
        )
        .limit(1);
      if (!otp) {
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
      logger.error("Email verification error", err as Error);
      return c.json({ error: "INTERNAL_ERROR", message: "Verification failed" }, 500);
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
      logger.error("Resend verification error", err as Error);
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  }
);

// POST /login
router.post("/login", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "INVALID_REQUEST", message: "email and password required" }, 400);
    }

    // Credential-stuffing defense: block a source IP that has been failing logins
    // across many accounts, independent of any single account's lockout.
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
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);
    const user = users[0];
    if (!user?.passwordHash) {
      recordIpLoginFailure(clientIp, email);
      return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordIpLoginFailure(clientIp, email);
      return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
    }

    recordIpLoginSuccess(clientIp);

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

    const { body } = await issueAuthenticatedSession(c, user);
    return c.json(body);
  } catch (err) {
    logger.error("Login error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Login failed" }, 500);
  }
});

// POST /login/mfa — complete a login that requires a second factor.
// Exchanges a valid TOTP code (or one-time backup code) + the challenge token
// from POST /login for a real session.
router.post("/login/mfa", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  try {
    const { mfaToken, code } = await c.req.json();
    if (!mfaToken || !code) {
      return c.json({ error: "INVALID_REQUEST", message: "mfaToken and code are required" }, 400);
    }

    const tokenSvc = await getTokenService();
    let payload: Awaited<ReturnType<TokenService["verifyAccessToken"]>>;
    try {
      payload = await tokenSvc.verifyAccessToken(mfaToken);
    } catch {
      return c.json({ error: "MFA_TOKEN_INVALID", message: "Invalid or expired MFA token" }, 401);
    }

    if (payload.aud !== MFA_CHALLENGE_AUD || !payload.scope?.includes(MFA_CHALLENGE_SCOPE)) {
      return c.json({ error: "MFA_TOKEN_INVALID", message: "Not an MFA challenge token" }, 401);
    }

    const db = getDb();
    const users = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1);
    const user = users[0];
    if (!user) {
      return c.json({ error: "MFA_TOKEN_INVALID", message: "Invalid or expired MFA token" }, 401);
    }

    const mfa = (user.mfa as any) ?? {};
    if (mfa?.totp?.enabled !== true || !mfa?.totp?.secret) {
      // The challenge was issued but TOTP was since removed — nothing to verify.
      return c.json(
        { error: "MFA_NOT_ENABLED", message: "MFA is not enabled for this account" },
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
      return c.json({ error: "INVALID_CODE", message: "Invalid MFA code" }, 401);
    }

    const { body } = await issueAuthenticatedSession(c, user);
    return c.json(body);
  } catch (err) {
    logger.error("Login MFA error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "MFA verification failed" }, 500);
  }
});

// POST /token/refresh
router.post(
  "/token/refresh",
  rateLimit({ points: 20, windowSecs: 60 }),
  requireProofOfPossession(),
  async (c) => {
    try {
      const { refreshToken } = await c.req.json();
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
      if (!rt || rt.isRevoked || rt.expiresAt < new Date()) {
        return c.json({ error: "TOKEN_INVALID", message: "Invalid refresh token" }, 401);
      }

      await db
        .update(refreshTokensTable)
        .set({ isRevoked: true, usedAt: new Date() })
        .where(eq(refreshTokensTable.id, rt.id));

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

      const popKey = c.req.header("x-pop-key") || undefined;
      const newSessionId = crypto.randomUUID();

      const accessToken = await tokenSvc.signAccessToken({
        sub: user.id,
        email: user.email,
        sid: newSessionId,
        aud: "zeroauth",
        scope: ["openid"],
        pop_key: popKey,
      });
      const payload = await tokenSvc.verifyAccessToken(accessToken);

      const [session] = await db
        .insert(sessionsTable)
        .values({
          id: newSessionId,
          userId: user.id,
          tokenId: payload.jti,
          deviceFingerprint: {},
          ipAddress: getClientIp(c),
          userAgent: c.req.header("user-agent"),
          expiresAt: new Date(payload.exp * 1000),
          lastActivityAt: new Date(),
          isActive: true,
        })
        .returning();

      const newRefreshPlain = await tokenSvc.signRefreshToken();
      const newRefreshHash = hashToken(newRefreshPlain);
      await db.insert(refreshTokensTable).values({
        userId: user.id,
        sessionId: session.id,
        tokenHash: newRefreshHash,
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });

      return c.json({
        accessToken,
        refreshToken: newRefreshPlain,
        expiresIn: cfg.session.defaultTTL,
        tokenType: "Bearer",
      });
    } catch (err) {
      logger.error("Refresh token error", err as Error);
      return c.json({ error: "INTERNAL_ERROR", message: "Refresh failed" }, 500);
    }
  }
);

// POST /oauth/state
router.post("/oauth/state", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const state = await generateOAuthState((body as any).codeChallenge);
  return c.json({ state, ttlSeconds: OAUTH_STATE_TTL_SECS });
});

// GET /oauth/:provider/authorize — returns the provider authorization URL + state.
//
// PKCE is generated server-side: the code_verifier is created here, kept only in
// the (Redis/in-memory) state record, and never sent to the browser. This keeps
// the verifier secret end-to-end (the SPA cannot leak it via URL/history) while
// still binding the authorization code to this transaction. The CSRF `state` is
// validated on the callback.
router.get("/oauth/:provider/authorize", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  const provider = c.req.param("provider");
  if (!isSupportedProvider(provider)) {
    return c.json(
      { error: "UNSUPPORTED_PROVIDER", message: `Provider '${provider}' is not supported` },
      400
    );
  }

  const cfg = getConfig();
  const p = cfg.oauth.providers[provider];
  if (!p?.clientId || !p?.clientSecret || !p?.redirectUri) {
    return c.json(
      { error: "PROVIDER_NOT_CONFIGURED", message: `Provider '${provider}' is not configured` },
      400
    );
  }

  let codeChallenge: string | undefined;
  let codeVerifier: string | undefined;
  if (PROVIDER_META[provider].supportsPKCE) {
    codeVerifier = nodeCrypto.randomBytes(32).toString("base64url");
    codeChallenge = nodeCrypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  const state = await generateOAuthState(codeChallenge, codeVerifier);
  const authorizeUrl = buildAuthorizationUrl(provider, {
    clientId: p.clientId,
    redirectUri: p.redirectUri,
    state,
    codeChallenge,
  });

  return c.json({ authorizeUrl, state });
});

// GET /oauth/:provider/callback
router.get("/oauth/:provider/callback", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const provider = c.req.param("provider");
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code) {
      return c.json({ error: "INVALID_REQUEST", message: "code is required" }, 400);
    }
    const stateResult = await getAndVerifyOAuthState(state);
    if (!stateResult.ok) {
      return c.json({ error: "INVALID_STATE", message: "Invalid or expired state" }, 400);
    }

    // PKCE verification: if a code_challenge was stored, the code_verifier must match
    let codeVerifier: string | null = null;
    if (stateResult.codeChallenge) {
      codeVerifier = stateResult.codeVerifier;
      if (!codeVerifier) {
        return c.json({ error: "PKCE_REQUIRED", message: "code_verifier is required" }, 400);
      }
      const { createHash } = await import("node:crypto");
      const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
      if (challenge !== stateResult.codeChallenge) {
        return c.json({ error: "PKCE_MISMATCH", message: "Invalid code_verifier" }, 400);
      }
    }

    const adapter = getProviderAdapter(provider);
    let result: Awaited<ReturnType<typeof adapter.exchangeCode>>;
    try {
      result = await adapter.exchangeCode(code, codeVerifier ?? undefined);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("UNSUPPORTED_OAUTH_PROVIDER")) {
        return c.json(
          { error: "UNSUPPORTED_PROVIDER", message: `Provider '${provider}' is not supported` },
          501
        );
      }
      throw err;
    }
    if (!result?.profile) {
      return c.json({ error: "PROVIDER_ERROR", message: "Provider token exchange failed" }, 502);
    }

    const profile: any = result.profile;
    const rawEmail = profile.email || profile.emails?.[0]?.value;
    if (!rawEmail) {
      return c.json({ error: "NO_EMAIL", message: "Provider did not return email" }, 400);
    }
    const email = String(rawEmail).toLowerCase().trim();
    const providerId = profile.id != null ? String(profile.id) : undefined;
    const link = { provider, providerId, email, connectedAt: new Date() };

    const db = getDb();
    const userRows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let user = userRows[0];

    if (!user) {
      const [created] = await db
        .insert(usersTable)
        .values({
          email,
          displayName: profile.name || email.split("@")[0],
          roles: ["user"],
          oauthProviders: [link],
          // Trust the IdP's verification assertion for the initial email.
          emailVerifiedAt: profile.emailVerified ? new Date() : null,
          status: "active",
        } as any)
        .returning();
      user = created;
    } else {
      const providers: any[] = (user.oauthProviders as any[]) || [];
      const has = providers.some((p) => p.provider === provider && p.providerId === providerId);
      if (!has) {
        await db
          .update(usersTable)
          .set({ oauthProviders: [...providers, link], updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
      }
    }

    // Mint the session through the shared helper so OAuth logins get the same
    // device fingerprinting, new-device alerting, and max-device enforcement as
    // password logins.
    const { body, sessionId } = await issueAuthenticatedSession(c, user);

    // Hand the tokens off via a short-lived, one-time exchange code rather than
    // putting them in the redirect URL (browser history, logs, Referer). The SPA
    // redeems it via POST /oauth/exchange.
    const exchangeCode = nanoid(32);
    const EXCHANGE_CODE_TTL_SECS = 60;
    await db.insert(oauthExchangeCodesTable).values({
      code: exchangeCode,
      userId: user.id,
      sessionId,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: new Date(Date.now() + EXCHANGE_CODE_TTL_SECS * 1000),
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    return c.redirect(`${appUrl}/login?oauth_code=${exchangeCode}`, 302);
  } catch (err) {
    logger.error("OAuth callback error", err as Error);
    // Redirect to frontend login with an error so the user isn't stuck on a
    // bare JSON error page at the API origin.
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    return c.redirect(
      `${appUrl}/login?error=OAUTH_FAILED&message=${encodeURIComponent("OAuth callback failed")}`,
      302
    );
  }
});

// POST /oauth/exchange — redeems a short-lived exchange code for tokens.
// This avoids passing tokens through the URL (browser history, logs, Referer).
router.post("/oauth/exchange", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  try {
    const { code } = await c.req.json().catch(() => ({}));
    if (!code || typeof code !== "string") {
      return c.json({ error: "INVALID_REQUEST", message: "code is required" }, 400);
    }

    const db = getDb();
    const [row] = await db
      .select()
      .from(oauthExchangeCodesTable)
      .where(eq(oauthExchangeCodesTable.code, code))
      .limit(1);

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return c.json({ error: "INVALID_CODE", message: "Invalid or expired code" }, 400);
    }

    // Mark as used (one-time)
    await db
      .update(oauthExchangeCodesTable)
      .set({ usedAt: new Date() })
      .where(eq(oauthExchangeCodesTable.code, code));

    return c.json({
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
    });
  } catch (err) {
    logger.error("OAuth exchange error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Token exchange failed" }, 500);
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
    const rawMfa = (row.mfa as any) ?? {};
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
    const passkeys = ((row.passkeys as any[]) ?? []).map((pk) => ({
      credentialId: pk.credentialId,
      name: pk.name ?? "Passkey",
      deviceType: pk.deviceType,
      aaguid: pk.aaguid,
      backedUp: pk.backedUp,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt ?? null,
    }));
    const oauthProviders = ((row.oauthProviders as any[]) ?? []).map((p) => ({
      provider: p.provider,
      email: p.email,
      connectedAt: p.connectedAt,
    }));

    const { mfa: _m, passkeys: _p, oauthProviders: _o, ...rest } = row as any;
    return c.json({
      ...rest,
      emailVerified: row.emailVerifiedAt != null,
      mfa,
      passkeys,
      oauthProviders,
    });
  } catch (err) {
    logger.error("Get current user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
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
});

router.patch("/me", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const db = getDb();
    const [updated] = await db
      .update(usersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        roles: usersTable.roles,
        status: usersTable.status,
        phone: usersTable.phone,
        locale: usersTable.locale,
        updatedAt: usersTable.updatedAt,
      });
    if (!updated) return c.json({ error: "USER_NOT_FOUND" }, 404);
    return c.json(updated);
  } catch (err) {
    logger.error("Patch current user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
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
    if ((row?.metadata as any)?.onboardingCompletedAt) {
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
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to mark onboarding complete" }, 500);
  }
});

// ── GET /auth/me/streak ───────────────────────────────────────────────────────
router.get("/me/streak", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { getStreak } = await import("../../services/streak.service.js");
    const streak = await getStreak(user.id);
    return c.json({ streak });
  } catch (err) {
    logger.error("Get streak error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── GET /auth/me/achievements ─────────────────────────────────────────────────
router.get("/me/achievements", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { getUserAchievements, ACHIEVEMENT_DEFS } = await import(
      "../../services/achievement.service.js"
    );
    const unlocked = await getUserAchievements(user.id);
    const achievements = Object.values(ACHIEVEMENT_DEFS).map((def) => {
      const found = unlocked.find((u: any) => u.key === def.key);
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        icon: def.icon,
        unlockedAt: found?.unlockedAt ?? null,
      };
    });
    return c.json({ achievements });
  } catch (err) {
    logger.error("Get achievements error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── GET /auth/me/points ───────────────────────────────────────────────────────
router.get("/me/points", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { getPointsBalance, getPointsHistory } = await import("../../services/points.service.js");
    const balance = await getPointsBalance(user.id);
    const { entries, total } = await getPointsHistory(user.id);
    return c.json({ balance, history: entries, total });
  } catch (err) {
    logger.error("Get points error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── NPS survey ────────────────────────────────────────────────────────────────

// GET /auth/me/nps/should-prompt — check if user should see NPS survey
router.get("/me/nps/should-prompt", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { shouldPromptNps } = await import("../../services/nps.service.js");
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
    const { recordNpsFeedback } = await import("../../services/nps.service.js");
    await recordNpsFeedback(user.id, score, comment, context);
    return c.json({ success: true });
  } catch (err) {
    logger.error("NPS submit error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── DELETE /auth/oauth/:provider — unlink a connected OAuth account ──────────
// Removes the linked social-login provider. Refuses to remove the user's *only*
// remaining login method (no password + this is the last provider), which would
// otherwise lock them out of their account.
router.delete("/oauth/:provider", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const provider = c.req.param("provider");

    const db = getDb();
    const [row] = await db
      .select({ passwordHash: usersTable.passwordHash, oauthProviders: usersTable.oauthProviders })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!row) return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);

    const providers: any[] = (row.oauthProviders as any[]) ?? [];
    const linked = providers.some((p) => p.provider === provider);
    if (!linked) {
      return c.json({ error: "NOT_LINKED", message: `No ${provider} account is linked` }, 404);
    }

    const hasPassword = Boolean(row.passwordHash);
    if (!hasPassword && providers.length <= 1) {
      return c.json(
        {
          error: "LAST_CREDENTIAL",
          message:
            "Set a password before disconnecting your only sign-in method, or you'll be locked out.",
        },
        409
      );
    }

    const remaining = providers.filter((p) => p.provider !== provider);
    await db
      .update(usersTable)
      .set({ oauthProviders: remaining, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    // Treat unlinking a login method as a sensitive change: revoke other
    // sessions and alert the user, mirroring email/password change handling.
    void recordAndRespond(user.id, "oauth_unlink", {
      email: user.email,
      displayName: user.displayName ?? user.email,
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent"),
    });

    return c.json({ unlinked: true, provider });
  } catch (err) {
    logger.error("OAuth unlink error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to disconnect account" }, 500);
  }
});

// ── POST /auth/me/link — link an OAuth identity to the current account ───────
// Allows a signed-in user to link an additional OAuth provider to their existing
// account instead of creating a duplicate. Requires the OAuth flow to complete
// first, then the frontend calls this with the provider + providerUserId.
router.post("/me/link", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { provider, providerUserId, providerEmail } = await c.req.json().catch(() => ({}));

    if (!provider || !providerUserId) {
      return c.json(
        { error: "INVALID_REQUEST", message: "provider and providerUserId required" },
        400
      );
    }

    const supported = ["google", "github", "apple", "facebook"];
    if (!supported.includes(provider)) {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: `Unsupported provider. Supported: ${supported.join(", ")}`,
        },
        400
      );
    }

    const db = getDb();

    // Check if this provider account is already linked to someone else
    const [existingLink] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, "active"),
          sql`${usersTable.oauthProviders} @> ${JSON.stringify([{ provider, providerUserId }])}::jsonb`
        )
      )
      .limit(1);

    if (existingLink && existingLink.id !== user.id) {
      return c.json(
        {
          error: "ALREADY_LINKED",
          message: "This OAuth account is already linked to another user",
        },
        409
      );
    }

    // Check if already linked to current user
    const [currentUser] = await db
      .select({ oauthProviders: usersTable.oauthProviders })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const providers: any[] = (currentUser?.oauthProviders as any) ?? [];
    if (providers.some((p: any) => p.provider === provider)) {
      return c.json(
        { error: "ALREADY_LINKED", message: `This account already has ${provider} linked` },
        409
      );
    }

    // Link the provider
    const newProvider = {
      provider,
      providerUserId,
      email: providerEmail ?? null,
      linkedAt: new Date().toISOString(),
    };

    await db
      .update(usersTable)
      .set({
        oauthProviders: [...providers, newProvider],
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    logger.info("OAuth provider linked", { userId: user.id, provider });
    return c.json({ linked: true, provider });
  } catch (err) {
    logger.error("Account link error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to link account" }, 500);
  }
});

// ── POST /auth/me/email — change email (requires current password) ───────────

router.post("/me/email", authMiddleware, rateLimit({ points: 5, windowSecs: 60 }), async (c) => {
  try {
    const user = c.get("user");
    const { newEmail, password } = await c.req.json().catch(() => ({}));
    if (!newEmail || !password) {
      return c.json({ error: "INVALID_REQUEST", message: "newEmail and password required" }, 400);
    }

    const db = getDb();
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (!row?.passwordHash) {
      return c.json({ error: "REAUTH_REQUIRED", message: "Password verification required" }, 403);
    }

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) {
      return c.json({ error: "INVALID_CREDENTIALS", message: "Incorrect password" }, 401);
    }

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
    logger.error("Email change error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── POST /auth/me/avatar ──────────────────────────────────────────────────────

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

router.post("/me/avatar", authMiddleware, async (c) => {
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
        { error: "INVALID_TYPE", message: "Only JPEG, PNG, GIF, WebP images are allowed" },
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

    return c.json({ avatarUrl });
  } catch (err) {
    logger.error("Avatar upload error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
