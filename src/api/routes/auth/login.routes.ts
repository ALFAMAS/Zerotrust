import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../../db";
import { usersTable } from "../../../db/schema";
import {
  getLoginThrottle,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../../../middleware/accountLockout";
import { captchaGuard } from "../../../middleware/captcha";
import {
  isIpBlocked,
  recordIpLoginFailure,
  recordIpLoginSuccess,
} from "../../../middleware/credentialStuffing";
import { rateLimit } from "../../../middleware/rateLimiting";
import { zValidator } from "../../../middleware/zodValidation";
import { issueAuthenticatedSession } from "../../../services/auth/issueAuthenticatedSession.service";
import { verifyPowSolution } from "../../../services/auth/proofOfWork.service";
import type { TokenService } from "../../../services/auth/token.service";
import { getSettings } from "../../../services/shared/saasSettings.service";
import { getClientIp } from "../../../shared/clientIp";
import { internalError } from "../../../shared/httpErrors";
import { dummyPasswordHash, verifyPassword } from "../../../shared/passwordHash";
import type { HonoEnv, User } from "../../../shared/types";
import { recordLoginFailure, recordLoginSuccess } from "../../authLoginEffects";
import { LoginBodySchema } from "../../schemas/auth.schema";
import {
  getTokenService,
  hashToken,
  issueMfaChallengeToken,
  logger,
  MFA_CHALLENGE_AUD,
  MFA_CHALLENGE_SCOPE,
  MFA_CHALLENGE_TTL_SECS,
  rehashPasswordIfLegacy,
  userRequiresMfa,
  verifyTotpCode,
} from "./_shared";

const router = new Hono<HonoEnv>();
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

export default router;
