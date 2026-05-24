import express from "express";
import { rateLimit } from "../../middleware/rateLimiting";
import { sendMagicLink, verifyMagicLink } from "../../services/magicLink.service";
import { getSettings } from "../../models/settings.model";
import { UserModel, SessionModel, RefreshTokenModel } from "../../models";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import crypto from "crypto";

const router = express.Router();
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

async function issueTokensForUser(
  userId: string,
  req: express.Request
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const cfg = getConfig();
  const tokenSvc = await getTokenService();
  const user = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");

  const accessToken = await tokenSvc.signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    aud: "zeroauth",
    scope: ["openid"],
  });
  const payload = await tokenSvc.verifyAccessToken(accessToken);

  const session = await SessionModel.create({
    userId: user._id,
    tokenId: payload.jti,
    deviceFingerprint: {},
    ipAddress: req.ip || "",
    userAgent: req.headers["user-agent"] as string,
    expiresAt: new Date(payload.exp * 1000),
    lastActivityAt: new Date(),
    isActive: true,
  });

  const refreshTokenPlain = await tokenSvc.signRefreshToken();
  await RefreshTokenModel.create({
    userId: user._id,
    sessionId: session._id,
    tokenHash: hashToken(refreshTokenPlain),
    expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
  });

  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    expiresIn: cfg.session.defaultTTL,
  };
}

// POST /send — always returns 200 { sent: true }
router.post("/send", rateLimit({ points: 5, windowSecs: 60 }), async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" });
    }

    const { email, redirectUrl } = req.body as { email?: string; redirectUrl?: string };
    if (!email) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "email is required" });
    }

    await sendMagicLink(email, redirectUrl);
    return res.status(200).json({ sent: true });
  } catch (err) {
    logger.error("Magic link send error", err as Error);
    return res.status(200).json({ sent: true }); // Anti-enumeration: always 200
  }
});

// GET /verify?email=&token= — issues tokens and redirects
router.get("/verify", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" });
    }

    const { email, token, redirect } = req.query as {
      email?: string;
      token?: string;
      redirect?: string;
    };

    if (!email || !token) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "email and token required" });
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: "Invalid or expired magic link" });
    }

    const tokens = await issueTokensForUser(result.userId, req);

    const appUrl = settings.appUrl || "http://localhost:3002";
    const callbackBase = redirect || `${appUrl}/auth/callback`;
    const callbackUrl =
      `${callbackBase}?accessToken=${encodeURIComponent(tokens.accessToken)}` +
      `&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;

    return res.redirect(302, callbackUrl);
  } catch (err) {
    logger.error("Magic link GET verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Verification failed" });
  }
});

// POST /verify — returns JSON tokens
router.post("/verify", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.magicLinkEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Magic link is disabled" });
    }

    const { email, token } = req.body as { email?: string; token?: string };
    if (!email || !token) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "email and token required" });
    }

    const result = await verifyMagicLink(email, token);
    if (!result) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: "Invalid or expired magic link" });
    }

    const tokens = await issueTokensForUser(result.userId, req);
    return res.status(200).json(tokens);
  } catch (err) {
    logger.error("Magic link POST verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Verification failed" });
  }
});

export default router;
