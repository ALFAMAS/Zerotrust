import express from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";
import { UserModel, SessionModel, RefreshTokenModel } from "../../models";
import { FingerprintService } from "../../services/fingerprint.service";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { requireProofOfPossession } from "../../middleware/proofOfPossession";
import { validate } from "../../middleware/validation";
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from "../schemas/auth.schema";
import {
  checkAccountLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../../middleware/accountLockout";
import { getLogger } from "../../logger";
import { getProviderAdapter } from "../../oauth/provider.factory";

const router = express.Router();
const logger = getLogger("auth-routes");

// In-memory OAuth state store with TTL (5 minutes)
const oauthStateStore = new Map<
  string,
  { ts: number; nonce: string; codeChallenge?: string; redirectUri?: string }
>();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

const ALLOWED_REDIRECT_URIS = (process.env.OAUTH_ALLOWED_REDIRECT_URIS || "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

function generateOAuthState(nonce: string, codeChallenge?: string, redirectUri?: string) {
  const state = nanoid();
  oauthStateStore.set(state, { ts: Date.now(), nonce, codeChallenge, redirectUri });
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

router.post(
  "/register",
  rateLimit({ points: 10, windowSecs: 60 }),
  validate(RegisterSchema),
  async (req, res) => {
    try {
      const { email, password, displayName } = req.body as any;

      const existing = await UserModel.findOne({ email });
      if (existing)
        return res
          .status(409)
          .json({ code: "USER_ALREADY_EXISTS", message: "User already exists", details: [] });

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

      res.status(201).json({ success: true, userId: user._id.toString() });
    } catch (err) {
      logger.error("Registration error", err as Error);
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Registration failed", details: [] });
    }
  }
);

router.post(
  "/login",
  rateLimit({ points: 20, windowSecs: 60 }),
  checkAccountLockout,
  validate(LoginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.body as any;

      const user = await UserModel.findOne({ email });
      if (!user || !user.passwordHash) {
        await recordFailedLogin(email);
        return res
          .status(401)
          .json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials", details: [] });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        await recordFailedLogin(email);
        return res
          .status(401)
          .json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials", details: [] });
      }

      recordSuccessfulLogin(email);

      const cfg = getConfig();
      const tokenSvc = await getTokenService();

      const fpInput = FingerprintService.extractFromRequest(req);
      const fingerprint = FingerprintService.compute(fpInput);
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

      const refreshTokenPlain = await tokenSvc.signRefreshToken();
      const refreshTokenHash = hashToken(refreshTokenPlain);
      await RefreshTokenModel.create({
        userId: user._id,
        sessionId: session._id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });

      await enforceMaxConcurrentDevices(user._id.toString());

      res.json({
        accessToken,
        refreshToken: refreshTokenPlain,
        expiresIn: cfg.session.defaultTTL,
        tokenType: "Bearer",
      });
    } catch (err) {
      logger.error("Login error", err as Error);
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Login failed", details: [] });
    }
  }
);

router.post(
  "/token/refresh",
  rateLimit({ points: 20, windowSecs: 60 }),
  requireProofOfPossession(),
  validate(RefreshTokenSchema),
  async (req, res) => {
    try {
      const { refreshToken } = req.body as any;
      const tokenHash = hashToken(refreshToken);

      const rt = await RefreshTokenModel.findOne({ tokenHash, isRevoked: false });
      if (!rt || rt.expiresAt < new Date())
        return res
          .status(401)
          .json({ code: "TOKEN_INVALID", message: "Invalid refresh token", details: [] });

      rt.isRevoked = true;
      rt.usedAt = new Date();
      await rt.save();

      const cfg = getConfig();
      const tokenSvc = await getTokenService();
      const userId = rt.userId.toString();

      const user = await UserModel.findById(userId);
      if (!user)
        return res
          .status(404)
          .json({ code: "USER_NOT_FOUND", message: "User not found", details: [] });

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
        deviceFingerprint: {
          hash: "",
          languages: [],
          isTrusted: false,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
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
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Refresh failed", details: [] });
    }
  }
);

router.post("/logout", rateLimit({ points: 20, windowSecs: 60 }), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ code: "TOKEN_INVALID", message: "Authorization required", details: [] });
    }
    const tokenSvc = await getTokenService();
    const payload = await tokenSvc.verifyAccessToken(authHeader.substring(7));
    await SessionModel.updateOne(
      { tokenId: payload.jti, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedReason: "logout" }
    );
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

router.post("/logout/all", rateLimit({ points: 5, windowSecs: 60 }), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ code: "TOKEN_INVALID", message: "Authorization required", details: [] });
    }
    const tokenSvc = await getTokenService();
    const payload = await tokenSvc.verifyAccessToken(authHeader.substring(7));
    await SessionModel.updateMany(
      { userId: payload.sub, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedReason: "logout_all" }
    );
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// OAuth: generate state + nonce
router.post("/oauth/state", rateLimit({ points: 20, windowSecs: 60 }), (req, res) => {
  const { codeChallenge, redirectUri } = req.body as any;

  if (
    redirectUri &&
    ALLOWED_REDIRECT_URIS.length > 0 &&
    !ALLOWED_REDIRECT_URIS.includes(redirectUri)
  ) {
    return res.status(400).json({
      code: "INVALID_REDIRECT_URI",
      message: "Redirect URI not in allowlist",
      details: [],
    });
  }

  const nonce = nanoid();
  const state = generateOAuthState(nonce, codeChallenge, redirectUri);
  res.json({ state, nonce, ttlSeconds: Math.floor(OAUTH_STATE_TTL_MS / 1000) });
});

// OAuth initiation redirect
router.get("/oauth/:provider", rateLimit({ points: 20, windowSecs: 60 }), (req, res) => {
  const { provider } = req.params as any;
  const cfg = getConfig();
  const p = cfg.oauth.providers[provider];
  if (!p || !p.clientId) {
    return res.status(400).json({
      code: "PROVIDER_NOT_CONFIGURED",
      message: `OAuth provider ${provider} is not configured`,
      details: [],
    });
  }

  const { codeChallenge } = req.query as any;
  const nonce = nanoid();
  const state = generateOAuthState(nonce, codeChallenge);

  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: getProviderScope(provider),
    state,
    nonce,
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  const authUrl = getProviderAuthUrl(provider, params);
  if (!authUrl)
    return res.status(400).json({
      code: "PROVIDER_NOT_SUPPORTED",
      message: `Provider ${provider} auth URL unknown`,
      details: [],
    });

  res.redirect(authUrl);
});

function getProviderScope(provider: string): string {
  const scopes: Record<string, string> = {
    google: "openid email profile",
    github: "read:user user:email",
    facebook: "email public_profile",
    apple: "name email",
  };
  return scopes[provider] || "openid email";
}

function getProviderAuthUrl(provider: string, params: URLSearchParams): string | null {
  const bases: Record<string, string> = {
    google: "https://accounts.google.com/o/oauth2/v2/auth",
    github: "https://github.com/login/oauth/authorize",
    facebook: "https://www.facebook.com/v18.0/dialog/oauth",
    apple: "https://appleid.apple.com/auth/authorize",
  };
  const base = bases[provider];
  if (!base) return null;
  if (provider === "apple") {
    params.set("response_mode", "form_post");
    params.set("response_type", "code");
  }
  return `${base}?${params.toString()}`;
}

// OAuth callback
router.get(
  "/oauth/:provider/callback",
  rateLimit({ points: 20, windowSecs: 60 }),
  async (req, res) => {
    try {
      const { provider } = req.params as any;
      const { code, state, code_verifier } = req.query as any;
      if (!code)
        return res
          .status(400)
          .json({ code: "INVALID_REQUEST", message: "code is required", details: [] });

      const stateEntry = verifyOAuthState(state);
      if (!stateEntry)
        return res
          .status(400)
          .json({ code: "INVALID_STATE", message: "Invalid or expired state", details: [] });

      const adapter = getProviderAdapter(provider);
      const result = await adapter.exchangeCode(code, code_verifier || stateEntry.codeChallenge);
      if (!result || !result.profile)
        return res
          .status(502)
          .json({ code: "PROVIDER_ERROR", message: "Provider token exchange failed", details: [] });

      const profile: any = result.profile;
      const email = profile.email || (profile.emails && profile.emails[0]?.value);
      if (!email)
        return res
          .status(400)
          .json({ code: "NO_EMAIL", message: "Provider did not return email", details: [] });

      let user = await UserModel.findOne({ email });
      if (!user) {
        user = await UserModel.create({
          email,
          displayName: profile.name || email.split("@")[0],
          roles: ["user"],
          oauthProviders: [
            { provider, providerId: profile.id || profile.sub, connectedAt: new Date() },
          ],
          status: "active",
        } as any);
      } else {
        const has = (user.oauthProviders || []).some(
          (p: any) => p.provider === provider && (p.id === profile.id || p.id === profile.sub)
        );
        if (!has) {
          user.oauthProviders = [
            ...(user.oauthProviders || []),
            { provider, providerId: profile.id || profile.sub, connectedAt: new Date() },
          ];
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
        deviceFingerprint: {
          hash: "oauth",
          languages: [],
          isTrusted: false,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
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

      res.json({
        accessToken,
        refreshToken: refreshPlain,
        expiresIn: getConfig().session.defaultTTL,
      });
    } catch (err) {
      logger.error("OAuth callback error", err as Error);
      res
        .status(500)
        .json({ code: "INTERNAL_ERROR", message: "OAuth callback failed", details: [] });
    }
  }
);

export default router;
