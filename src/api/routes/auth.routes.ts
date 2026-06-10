import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { usersTable, sessionsTable, refreshTokensTable } from "../../db/schema";
import { FingerprintService } from "../../services/fingerprint.service";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import { getProviderAdapter } from "../../oauth/provider.factory";
import { sendWelcomeEmail } from "../../services/email.service";
import { rejectIfBreached } from "../../services/passwordBreach.service";
import { notifyIfNewDevice } from "../../services/loginNotification.service";
import { recordAndRespond } from "../../services/accountTakeover.service";
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
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
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

    const [user] = await db
      .insert(usersTable)
      .values({
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

    const loginUrl = `${process.env.APP_URL ?? "http://localhost:3001"}/login`;
    void sendWelcomeEmail(user.email, {
      name: user.displayName ?? user.email,
      loginUrl,
    });

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
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);
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
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
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
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
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
        metadata: usersTable.metadata,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!row) return c.json({ error: "USER_NOT_FOUND" }, 404);
    return c.json(row);
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
        updatedAt: usersTable.updatedAt,
      });
    if (!updated) return c.json({ error: "USER_NOT_FOUND" }, 404);
    return c.json(updated);
  } catch (err) {
    logger.error("Patch current user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
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
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0].trim(),
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
