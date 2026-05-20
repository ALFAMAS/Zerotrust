import express from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";
import { UserModel, SessionModel, RefreshTokenModel } from "../../models";
import { FingerprintService } from "../../services/fingerprint.service";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import {
  enforceMaxConcurrentDevices,
  requireSessionLimitOnLogin,
} from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { getLogger } from "../../logger";

const router = express.Router();
const logger = getLogger("auth-routes");

// Simple in-memory OAuth state store for PKCE/state validation (TTL: 5 minutes)
const oauthStateStore = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
function generateOAuthState() {
  const state = nanoid();
  oauthStateStore.set(state, Date.now());
  return state;
}
function verifyOAuthState(state?: string) {
  if (!state) return false;
  const ts = oauthStateStore.get(state);
  if (!ts) return false;
  if (Date.now() - ts > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return false;
  }
  oauthStateStore.delete(state);
  return true;
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

router.post("/register", rateLimit({ points: 10, windowSecs: 60 }), async (req, res) => {
  try {
    const { email, password, displayName } = req.body as any;
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "INVALID_REQUEST", message: "email and password required" });

    const existing = await UserModel.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "USER_ALREADY_EXISTS", message: "User already exists" });

    const cfg = getConfig();
    const passwordHash = await bcrypt.hash(password, cfg.security.bcryptRounds);

    const user = await UserModel.create({
      email,
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
    });

    export default router;
    res.status(201).json({ success: true, userId: user._id.toString() });
  } catch (err) {
    logger.error("Registration error", err as Error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Registration failed" });
  }
});

router.post("/login", rateLimit({ points: 20, windowSecs: 60 }), async (req, res) => {
  try {
    const { email, password } = req.body as any;
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "INVALID_REQUEST", message: "email and password required" });

    const user = await UserModel.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" });

    if (!user.passwordHash)
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" });

    const cfg = getConfig();
    const tokenSvc = await getTokenService();

    // Build device fingerprint
    const fpInput = FingerprintService.extractFromRequest(req);
    const fingerprint = FingerprintService.compute(fpInput);

    // Include PoP key if provided by client
    const popKey = (req.headers["x-pop-key"] as string) || undefined;

    const accessToken = await tokenSvc.signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      aud: "zeroauth",
      scope: ["openid"],
      pop_key: popKey,
    });
    const payload = await tokenSvc.verifyAccessToken(accessToken);

    // Create session
    const session = await SessionModel.create({
      userId: user._id,
      tokenId: payload.jti,
      deviceFingerprint: {
        ...fingerprint,
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: fpInput.ip,
      country: (req as any).inferredCountry || undefined,
      userAgent: req.headers["user-agent"] as string,
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
      proofOfPossessionKey: payload.pop_key,
    });

    // Issue refresh token (rotate)
    const refreshTokenPlain = await tokenSvc.signRefreshToken();
    const refreshTokenHash = hashToken(refreshTokenPlain);
    await RefreshTokenModel.create({
      userId: user._id,
      sessionId: session._id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
    });

    // Enforce session limits
    await enforceMaxConcurrentDevices(user._id.toString());

    res.json({
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Login error", err as Error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Login failed" });
  }
});

router.post(
  "/token/refresh",
  rateLimit({ points: 20, windowSecs: 60 }),
  requireProofOfPossession(),
  async (req, res) => {
    try {
      const { refreshToken } = req.body as any;
      if (!refreshToken)
        return res.status(400).json({ error: "INVALID_REQUEST", message: "refreshToken required" });
      const tokenHash = hashToken(refreshToken);

      const rt = await RefreshTokenModel.findOne({ tokenHash, isRevoked: false });
      if (!rt || rt.expiresAt < new Date())
        return res.status(401).json({ error: "TOKEN_INVALID", message: "Invalid refresh token" });

      // Rotate: revoke old
      rt.isRevoked = true;
      rt.usedAt = new Date();
      await rt.save();

      const cfg = getConfig();
      const tokenSvc = await getTokenService();
      const userId = rt.userId.toString();

      // Issue new access token and refresh token
      const user = await UserModel.findById(userId);
      if (!user)
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });

      const popKey = (req.headers["x-pop-key"] as string) || undefined;
      const accessToken = await tokenSvc.signAccessToken({
        sub: user._id.toString(),
        email: user.email,
        aud: "zeroauth",
        scope: ["openid"],
        pop_key: popKey,
      });
      const payload = await tokenSvc.verifyAccessToken(accessToken);

      // Create session entry
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

      const newRefreshPlain = await tokenSvc.signRefreshToken();
      const newRefreshHash = hashToken(newRefreshPlain);
      await RefreshTokenModel.create({
        userId: user._id,
        sessionId: session._id,
        tokenHash: newRefreshHash,
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });

      res.json({
        accessToken,
        refreshToken: newRefreshPlain,
        expiresIn: cfg.session.defaultTTL,
        tokenType: "Bearer",
      });
    } catch (err) {
      logger.error("Refresh token error", err as Error);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Refresh failed" });
    }
  }
);

// OAuth: provide a small endpoint to mint/return a transient state token
router.post("/oauth/state", rateLimit({ points: 20, windowSecs: 60 }), (req, res) => {
  const state = generateOAuthState();
  res.json({ state, ttlSeconds: Math.floor(OAUTH_STATE_TTL_MS / 1000) });
});

// OAuth callback: supports PKCE/state validation and exchanges code with provider adapters
import { getProviderAdapter } from "../../oauth/provider.factory";

router.get(
  "/oauth/:provider/callback",
  rateLimit({ points: 20, windowSecs: 60 }),
  async (req, res) => {
    try {
      const { provider } = req.params as any;
      const { code, state, code_verifier } = req.query as any;
      if (!code)
        return res.status(400).json({ error: "INVALID_REQUEST", message: "code is required" });
      if (!verifyOAuthState(state))
        return res
          .status(400)
          .json({ error: "INVALID_STATE", message: "Invalid or expired state" });

      const adapter = getProviderAdapter(provider);
      const result = await adapter.exchangeCode(code, code_verifier);
      if (!result || !result.profile)
        return res
          .status(502)
          .json({ error: "PROVIDER_ERROR", message: "Provider token exchange failed" });

      const profile: any = result.profile;
      const email =
        profile.email || (profile.emails && profile.emails[0] && profile.emails[0].value);
      if (!email)
        return res
          .status(400)
          .json({ error: "NO_EMAIL", message: "Provider did not return email" });

      // Find or create user
      let user = await UserModel.findOne({ email });
      if (!user) {
        user = await UserModel.create({
          email,
          displayName: profile.name || email.split("@")[0],
          roles: ["user"],
          oauthProviders: [{ provider, id: profile.id }],
          status: "active",
        } as any);
      } else {
        // append provider if missing
        const has = (user.oauthProviders || []).some(
          (p: any) => p.provider === provider && p.id === profile.id
        );
        if (!has) {
          user.oauthProviders = [...(user.oauthProviders || []), { provider, id: profile.id }];
          await user.save();
        }
      }

      const tokenSvc = await getTokenService();
      const popKey = (req.headers["x-pop-key"] as string) || undefined;
      const accessToken = await tokenSvc.signAccessToken({
        sub: user._id.toString(),
        email: user.email,
        aud: "zeroauth",
        scope: ["openid"],
        pop_key: popKey,
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

      const refreshPlain = await tokenSvc.signRefreshToken();
      await RefreshTokenModel.create({
        userId: user._id,
        sessionId: session._id,
        tokenHash: hashToken(refreshPlain),
        expiresAt: new Date(Date.now() + getConfig().session.refreshTokenTTL * 1000),
      });

      // Redirect developer UX: return tokens in JSON (client apps can request JSON)
      res.json({
        accessToken,
        refreshToken: refreshPlain,
        expiresIn: getConfig().session.defaultTTL,
      });
    } catch (err) {
      logger.error("OAuth callback error", err as Error);
      res.status(500).json({ error: "INTERNAL_ERROR", message: "OAuth callback failed" });
    }
  }
);

export default router;
