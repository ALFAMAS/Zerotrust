import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { getConfig } from "../../config";
import { getDb } from "../../db";
import { refreshTokensTable, sessionsTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { rateLimit } from "../../middleware/rateLimiting";
import { getSettings } from "../../models/settings.model";
import { sendMagicLink, verifyMagicLink } from "../../services/magicLink.service";
import { TokenService } from "../../services/token.service";
import { getClientIp } from "../../shared/clientIp";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("magic-link-routes");

let _tokenService: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (_tokenService) return _tokenService;
  const cfg = getConfig();
  _tokenService = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await _tokenService.init();
  return _tokenService;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueTokensForUser(userId: string, c: Context<HonoEnv>) {
  const cfg = getConfig();
  const tokenSvc = await getTokenService();
  const db = getDb();

  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const sessionId = crypto.randomUUID();
  const accessToken = await tokenSvc.signAccessToken({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    aud: "zeroauth",
    scope: ["openid"],
  });
  const payload = await tokenSvc.verifyAccessToken(accessToken);

  const ip = getClientIp(c);
  const userAgent = c.req.header("user-agent") || "";

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      userId: user.id,
      tokenId: payload.jti,
      deviceFingerprint: {},
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    })
    .returning();

  const refreshTokenPlain = await tokenSvc.signRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    sessionId: session.id,
    tokenHash: hashToken(refreshTokenPlain),
    expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
  });

  return { accessToken, refreshToken: refreshTokenPlain, expiresIn: cfg.session.defaultTTL };
}

// POST /send
router.post("/send", rateLimit({ points: 5, windowSecs: 60 }), async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" }, 403);
    }

    const { email, redirectUrl } = await c.req.json();
    if (!email) {
      return c.json({ error: "INVALID_REQUEST", message: "email is required" }, 400);
    }

    await sendMagicLink(email, redirectUrl);
    return c.json({ sent: true });
  } catch (err) {
    logger.error("Magic link send error", err as Error);
    return c.json({ sent: true }); // Anti-enumeration: always 200
  }
});

// GET /verify?email=&token=
router.get("/verify", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" }, 403);
    }

    const email = c.req.query("email");
    const token = c.req.query("token");
    const redirect = c.req.query("redirect");

    if (!email || !token) {
      return c.json({ error: "INVALID_REQUEST", message: "email and token required" }, 400);
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return c.json({ error: "INVALID_TOKEN", message: "Invalid or expired magic link" }, 401);
    }

    const tokens = await issueTokensForUser(result.userId, c);

    const appUrl = settings.appUrl || "http://localhost:3000";
    const callbackBase = redirect || `${appUrl}/auth/callback`;
    const callbackUrl =
      `${callbackBase}?accessToken=${encodeURIComponent(tokens.accessToken)}` +
      `&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;

    return c.redirect(callbackUrl, 302);
  } catch (err) {
    logger.error("Magic link GET verify error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Verification failed" }, 500);
  }
});

// POST /verify
router.post("/verify", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" }, 403);
    }

    const { email, token } = await c.req.json();
    if (!email || !token) {
      return c.json({ error: "INVALID_REQUEST", message: "email and token required" }, 400);
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return c.json({ error: "INVALID_TOKEN", message: "Invalid or expired magic link" }, 401);
    }

    const tokens = await issueTokensForUser(result.userId, c);
    return c.json(tokens);
  } catch (err) {
    logger.error("Magic link POST verify error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Verification failed" }, 500);
  }
});

export default router;
