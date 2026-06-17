import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { usersTable, sessionsTable, refreshTokensTable, otpsTable } from "../../db/schema";
import { FingerprintService } from "../../services/fingerprint.service";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import { getProviderAdapter } from "../../oauth/provider.factory";
import { sendWelcomeEmail, sendVerificationEmail } from "../../services/email.service";
import { rejectIfBreached } from "../../services/passwordBreach.service";
import { notifyIfNewDevice } from "../../services/loginNotification.service";
import { recordAndRespond } from "../../services/accountTakeover.service";
import { validateSignupEmail } from "../../services/disposableEmail.service";
import { getClientIp } from "../../shared/clientIp";
import {
  isIpBlocked,
  recordIpLoginFailure,
  recordIpLoginSuccess,
} from "../../middleware/credentialStuffing";
import { normalizeLocale, localeFromAcceptLanguage, SUPPORTED_LOCALES } from "../../shared/locale";
import {
  isSignupPowEnabled,
  createPowChallenge,
  verifyPowSolution,
} from "../../services/proofOfWork.service";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("auth-routes");

const oauthStateStore = new Map<string, { ts: number }>();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function generateOAuthState() {
  const state = nanoid();
  oauthStateStore.set(state, { ts: Date.now() });
  return state;
}

function verifyOAuthState(state?: string) {
  if (!state) return null;
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (Date.now() - entry.ts > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return null;
  }
  oauthStateStore.delete(state);
  return entry;
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
    accessToken,
    refreshToken: refreshTokenPlain,
    expiresIn: cfg.session.defaultTTL,
    tokenType: "Bearer",
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
  const code = Math.floor(100000 + Math.random() * 900000).toString();
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
    if (!user || !user.passwordHash) {
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

    const body = await issueAuthenticatedSession(c, user);
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
      return c.json(
        { error: "INVALID_REQUEST", message: "mfaToken and code are required" },
        400
      );
    }

    const tokenSvc = await getTokenService();
    let payload;
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
      return c.json({ error: "MFA_NOT_ENABLED", message: "MFA is not enabled for this account" }, 400);
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

    const body = await issueAuthenticatedSession(c, user);
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
router.post("/oauth/state", rateLimit({ points: 20, windowSecs: 60 }), (c) => {
  const state = generateOAuthState();
  return c.json({ state, ttlSeconds: Math.floor(OAUTH_STATE_TTL_MS / 1000) });
});

// GET /oauth/:provider/callback
router.get("/oauth/:provider/callback", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const provider = c.req.param("provider");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const codeVerifier = c.req.query("code_verifier");

    if (!code) {
      return c.json({ error: "INVALID_REQUEST", message: "code is required" }, 400);
    }
    if (!verifyOAuthState(state)) {
      return c.json({ error: "INVALID_STATE", message: "Invalid or expired state" }, 400);
    }

    const adapter = getProviderAdapter(provider);
    let result;
    try {
      result = await adapter.exchangeCode(code, codeVerifier);
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
    const email = profile.email || profile.emails?.[0]?.value;
    if (!email) {
      return c.json({ error: "NO_EMAIL", message: "Provider did not return email" }, 400);
    }

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
          oauthProviders: [{ provider, providerId: profile.id, connectedAt: new Date() }],
          status: "active",
        } as any)
        .returning();
      user = created;
    } else {
      const providers: any[] = (user.oauthProviders as any[]) || [];
      const has = providers.some((p) => p.provider === provider && p.providerId === profile.id);
      if (!has) {
        await db
          .update(usersTable)
          .set({
            oauthProviders: [
              ...providers,
              { provider, providerId: profile.id, connectedAt: new Date() },
            ],
          })
          .where(eq(usersTable.id, user.id));
      }
    }

    const tokenSvc = await getTokenService();
    const popKey = c.req.header("x-pop-key") || undefined;
    const sessionId = crypto.randomUUID();

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
        deviceFingerprint: {},
        ipAddress: getClientIp(c),
        userAgent: c.req.header("user-agent"),
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      })
      .returning();

    const refreshPlain = await tokenSvc.signRefreshToken();
    await db.insert(refreshTokensTable).values({
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(refreshPlain),
      expiresAt: new Date(Date.now() + getConfig().session.refreshTokenTTL * 1000),
    });

    return c.json({
      accessToken,
      refreshToken: refreshPlain,
      expiresIn: getConfig().session.defaultTTL,
    });
  } catch (err) {
    logger.error("OAuth callback error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "OAuth callback failed" }, 500);
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

    const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${user.id}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, Buffer.from(await file.arrayBuffer()));

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const avatarUrl = `${appUrl}/uploads/avatars/${filename}`;

    const db = getDb();
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
