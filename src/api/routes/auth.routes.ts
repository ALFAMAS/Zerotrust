import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { usersTable, sessionsTable, refreshTokensTable } from "../../db/schema";
import { FingerprintService } from "../../services/fingerprint.service";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { getLogger } from "../../logger";
import { getProviderAdapter } from "../../oauth/provider.factory";
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

// POST /register
router.post("/register", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  try {
    const { email, password, displayName } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "INVALID_REQUEST", message: "email and password required" }, 400);
    }

    const db = getDb();
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return c.json({ error: "USER_ALREADY_EXISTS", message: "User already exists" }, 409);
    }

      const cfg = getConfig();
      const passwordHash = await bcrypt.hash(password, cfg.security.bcryptRounds);

    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName || email.split("@")[0],
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
        scheduleRestriction: { enabled: false, timezone: "UTC", allowedDays: [], allowedHoursStart: 0, allowedHoursEnd: 23 },
      },
    }).returning();

    return c.json({ success: true, userId: user.id }, 201);
  } catch (err) {
    logger.error("Registration error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Registration failed" }, 500);
  }
});

// POST /login
router.post("/login", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "INVALID_REQUEST", message: "email and password required" }, 400);
    }

    const db = getDb();
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    const user = users[0];
    if (!user || !user.passwordHash) {
      return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
    }

      const cfg = getConfig();
      const tokenSvc = await getTokenService();

    const fpInput = FingerprintService.extractFromRequest({
      headers: Object.fromEntries(c.req.raw.headers as any),
      ip: c.req.header("x-forwarded-for")?.split(",")[0].trim(),
    });
    const fingerprint = FingerprintService.compute(fpInput);

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

    const [session] = await db.insert(sessionsTable).values({
      id: sessionId,
      userId: user.id,
      tokenId: payload.jti,
      deviceFingerprint: { ...fingerprint, isTrusted: false, firstSeenAt: new Date(), lastSeenAt: new Date() },
      ipAddress: fpInput.ip,
      country: c.get("inferredCountry") || undefined,
      userAgent: c.req.header("user-agent"),
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
      proofOfPossessionKey: payload.pop_key,
    }).returning();

    const refreshTokenPlain = await tokenSvc.signRefreshToken();
    const refreshTokenHash = hashToken(refreshTokenPlain);
    await db.insert(refreshTokensTable).values({
      userId: user.id,
      sessionId: session.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
    });

    await enforceMaxConcurrentDevices(user.id);

    return c.json({
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Login error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Login failed" }, 500);
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

      const rtRows = await db.select().from(refreshTokensTable).where(eq(refreshTokensTable.tokenHash, tokenHash)).limit(1);
      const rt = rtRows[0];
      if (!rt || rt.isRevoked || rt.expiresAt < new Date()) {
        return c.json({ error: "TOKEN_INVALID", message: "Invalid refresh token" }, 401);
      }

      await db.update(refreshTokensTable).set({ isRevoked: true, usedAt: new Date() }).where(eq(refreshTokensTable.id, rt.id));

      const cfg = getConfig();
      const tokenSvc = await getTokenService();

      const userRows = await db.select().from(usersTable).where(eq(usersTable.id, rt.userId)).limit(1);
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

      const [session] = await db.insert(sessionsTable).values({
        id: newSessionId,
        userId: user.id,
        tokenId: payload.jti,
        deviceFingerprint: {},
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
        userAgent: c.req.header("user-agent"),
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      }).returning();

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
router.get(
  "/oauth/:provider/callback",
  rateLimit({ points: 20, windowSecs: 60 }),
  async (c) => {
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
      const result = await adapter.exchangeCode(code, codeVerifier);
      if (!result?.profile) {
        return c.json({ error: "PROVIDER_ERROR", message: "Provider token exchange failed" }, 502);
      }

      const profile: any = result.profile;
      const email = profile.email || profile.emails?.[0]?.value;
      if (!email) {
        return c.json({ error: "NO_EMAIL", message: "Provider did not return email" }, 400);
      }

      const db = getDb();
      let userRows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      let user = userRows[0];

      if (!user) {
        const [created] = await db.insert(usersTable).values({
          email,
          displayName: profile.name || email.split("@")[0],
          roles: ["user"],
          oauthProviders: [{ provider, providerId: profile.id, connectedAt: new Date() }],
          status: "active",
        } as any).returning();
        user = created;
      } else {
        const providers: any[] = (user.oauthProviders as any[]) || [];
        const has = providers.some((p) => p.provider === provider && p.providerId === profile.id);
        if (!has) {
          await db.update(usersTable)
            .set({ oauthProviders: [...providers, { provider, providerId: profile.id, connectedAt: new Date() }] })
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

      const [session] = await db.insert(sessionsTable).values({
        id: sessionId,
        userId: user.id,
        tokenId: payload.jti,
        deviceFingerprint: {},
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
        userAgent: c.req.header("user-agent"),
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      }).returning();

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
  }
);

export default router;
