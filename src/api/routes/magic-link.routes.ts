import express from "express";
import { sendMagicLink, verifyMagicLink } from "../../services/magicLink.service";
import { SessionModel, RefreshTokenModel } from "../../models";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { rateLimit } from "../../middleware/rateLimiting";
import { getLogger } from "../../logger";
import * as nodeCrypto from "crypto";

const router = express.Router();
const logger = getLogger("magic-link-routes");

let tokenSvc: TokenService | null = null;
async function getTokenSvc() {
  if (tokenSvc) return tokenSvc;
  const cfg = getConfig();
  tokenSvc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenSvc.init();
  return tokenSvc;
}

function hashToken(token: string) {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /auth/magic-link/send
 * Request a magic link to be sent to the given email address.
 * Always returns 200 to avoid user enumeration.
 */
router.post("/send", rateLimit({ points: 5, windowSecs: 60 }), async (req, res) => {
  try {
    const { email, redirectUrl } = req.body as { email?: string; redirectUrl?: string };

    if (!email || typeof email !== "string") {
      return res
        .status(400)
        .json({ code: "INVALID_REQUEST", message: "email is required", details: [] });
    }

    await sendMagicLink(email.toLowerCase().trim(), redirectUrl);

    // Always respond 200 regardless of whether user exists
    res.json({ success: true, message: "If that email exists, a sign-in link has been sent." });
  } catch (err) {
    logger.error("Magic link send error", err as Error);
    // Still return 200 to avoid leaking info
    res.json({ success: true, message: "If that email exists, a sign-in link has been sent." });
  }
});

/**
 * GET /auth/magic-link/verify
 * Verify the magic link token from the email.
 * Returns access + refresh tokens on success.
 */
router.get("/verify", rateLimit({ points: 10, windowSecs: 60 }), async (req, res) => {
  try {
    const { token, email } = req.query as { token?: string; email?: string };

    if (!token || !email) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "token and email are required",
        details: [],
      });
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return res.status(401).json({
        code: "MAGIC_LINK_INVALID",
        message: "Magic link is invalid or has expired",
        details: [],
      });
    }

    const svc = await getTokenSvc();
    const cfg = getConfig();

    const accessToken = await svc.signAccessToken({
      sub: result.userId,
      email: result.userEmail,
      aud: "zeroauth",
      scope: ["openid"],
    });
    const payload = await svc.verifyAccessToken(accessToken);

    const session = await SessionModel.create({
      userId: result.userId,
      tokenId: payload.jti,
      deviceFingerprint: {
        hash: "magic-link",
        languages: [],
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    });

    const refreshPlain = await svc.signRefreshToken();
    await RefreshTokenModel.create({
      userId: result.userId,
      sessionId: session._id,
      tokenHash: hashToken(refreshPlain),
      expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
    });

    res.json({
      accessToken,
      refreshToken: refreshPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Magic link verify error", err as Error);
    res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Magic link verification failed", details: [] });
  }
});

/**
 * POST /auth/magic-link/verify
 * Same as GET but accepts token+email in body (for programmatic clients).
 */
router.post("/verify", rateLimit({ points: 10, windowSecs: 60 }), async (req, res) => {
  try {
    const { token, email } = req.body as { token?: string; email?: string };

    if (!token || !email) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "token and email are required",
        details: [],
      });
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return res.status(401).json({
        code: "MAGIC_LINK_INVALID",
        message: "Magic link is invalid or has expired",
        details: [],
      });
    }

    const svc = await getTokenSvc();
    const cfg = getConfig();

    const accessToken = await svc.signAccessToken({
      sub: result.userId,
      email: result.userEmail,
      aud: "zeroauth",
      scope: ["openid"],
    });
    const payload = await svc.verifyAccessToken(accessToken);

    const session = await SessionModel.create({
      userId: result.userId,
      tokenId: payload.jti,
      deviceFingerprint: {
        hash: "magic-link",
        languages: [],
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    });

    const refreshPlain = await svc.signRefreshToken();
    await RefreshTokenModel.create({
      userId: result.userId,
      sessionId: session._id,
      tokenHash: hashToken(refreshPlain),
      expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
    });

    res.json({
      accessToken,
      refreshToken: refreshPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Magic link verify error", err as Error);
    res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Magic link verification failed", details: [] });
  }
});

export default router;
