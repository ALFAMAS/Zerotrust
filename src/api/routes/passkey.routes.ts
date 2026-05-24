import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { getSettings } from "../../models/settings.model";
import { UserModel, SessionModel, RefreshTokenModel } from "../../models";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import crypto from "crypto";

const router = express.Router();
const logger = getLogger("passkey-routes");

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

// In-memory challenge store (TTL: 5 minutes)
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function storeChallenge(userId: string, challenge: string): void {
  challengeStore.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function consumeChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(userId);
    return null;
  }
  challengeStore.delete(userId);
  return entry.challenge;
}

// For auth challenges, keyed by email
function storeAuthChallenge(key: string, challenge: string): void {
  challengeStore.set(`auth:${key}`, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function consumeAuthChallenge(key: string): string | null {
  return consumeChallenge(`auth:${key}`);
}

// ─── Registration ────────────────────────────────────────────────────────────

// POST /register/options — auth required
router.post("/register/options", authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" });
    }

    const user = req.user!;
    const userId = user._id!.toString();

    const {
      generateRegistrationOptions,
    } = await import("@simplewebauthn/server");

    const existingPasskeys = user.passkeys || [];
    const excludeCredentials = existingPasskeys.map((pk) => ({
      id: pk.credentialId,
      type: "public-key" as const,
      transports: pk.transports as any[],
    }));

    const options = await generateRegistrationOptions({
      rpName: settings.appName || "ZeroAuth",
      rpID: new URL(settings.appUrl || "http://localhost:3002").hostname,
      userID: userId,
      userName: user.email,
      userDisplayName: user.displayName,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Store challenge for verification
    storeChallenge(userId, options.challenge);

    return res.status(200).json(options);
  } catch (err) {
    logger.error("Passkey register options error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to generate options" });
  }
});

// POST /register/verify — auth required
router.post("/register/verify", authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" });
    }

    const user = req.user!;
    const userId = user._id!.toString();

    const expectedChallenge = consumeChallenge(userId);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "CHALLENGE_EXPIRED", message: "Registration challenge expired or not found" });
    }

    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");

    const appUrl = settings.appUrl || "http://localhost:3002";
    const rpID = new URL(appUrl).hostname;

    let verification: any;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge,
        expectedOrigin: appUrl,
        expectedRPID: rpID,
      });
    } catch (verifyErr) {
      logger.warn("Passkey registration verification failed", verifyErr as Error);
      return res.status(400).json({ error: "VERIFICATION_FAILED", message: "Registration verification failed" });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "VERIFICATION_FAILED", message: "Registration not verified" });
    }

    const { registrationInfo } = verification;
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Attach passkey to user
    const newPasskey = {
      credentialId: Buffer.from(credential.id).toString("base64url"),
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: req.body?.response?.transports || [],
      name: req.body.name || "Passkey",
      createdAt: new Date(),
    };

    await UserModel.findByIdAndUpdate(userId, {
      $push: { passkeys: newPasskey },
      "mfa.webauthn.enabled": true,
    });

    return res.status(200).json({ verified: true });
  } catch (err) {
    logger.error("Passkey register verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Registration verification failed" });
  }
});

// ─── Authentication ───────────────────────────────────────────────────────────

// POST /authenticate/options — public
router.post("/authenticate/options", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" });
    }

    const { email } = req.body as { email?: string };

    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");

    const appUrl = settings.appUrl || "http://localhost:3002";
    const rpID = new URL(appUrl).hostname;

    let allowCredentials: any[] = [];
    if (email) {
      const user = await UserModel.findOne({ email });
      if (user && user.passkeys?.length) {
        allowCredentials = user.passkeys.map((pk) => ({
          id: pk.credentialId,
          type: "public-key" as const,
          transports: pk.transports as any[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials,
    });

    const challengeKey = email || `anon:${crypto.randomBytes(8).toString("hex")}`;
    storeAuthChallenge(challengeKey, options.challenge);

    return res.status(200).json({ ...options, _challengeKey: challengeKey });
  } catch (err) {
    logger.error("Passkey auth options error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to generate options" });
  }
});

// POST /authenticate/verify — public, issues tokens on success
router.post("/authenticate/verify", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.passkeyEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Passkeys are disabled" });
    }

    const { email, challengeKey } = req.body as { email?: string; challengeKey?: string };
    const key = challengeKey || email;

    if (!key) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "email or challengeKey required" });
    }

    const expectedChallenge = consumeAuthChallenge(key);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "CHALLENGE_EXPIRED", message: "Authentication challenge expired" });
    }

    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");

    const appUrl = settings.appUrl || "http://localhost:3002";
    const rpID = new URL(appUrl).hostname;

    // Find user by credential ID
    const credentialId = req.body?.id || req.body?.rawId;
    if (!credentialId) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "credentialId required" });
    }

    const user = await UserModel.findOne({
      "passkeys.credentialId": credentialId,
    });

    if (!user) {
      return res.status(401).json({ error: "PASSKEY_NOT_FOUND", message: "No user found for this passkey" });
    }

    const passkey = user.passkeys.find((pk) => pk.credentialId === credentialId);
    if (!passkey) {
      return res.status(401).json({ error: "PASSKEY_NOT_FOUND", message: "Passkey not found" });
    }

    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge,
        expectedOrigin: appUrl,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          counter: passkey.counter,
          transports: passkey.transports as any[],
        },
      });
    } catch (verifyErr) {
      logger.warn("Passkey authentication verification failed", verifyErr as Error);
      return res.status(401).json({ error: "VERIFICATION_FAILED", message: "Authentication verification failed" });
    }

    if (!verification.verified) {
      return res.status(401).json({ error: "VERIFICATION_FAILED", message: "Authentication not verified" });
    }

    // Update passkey counter
    await UserModel.updateOne(
      { _id: user._id, "passkeys.credentialId": credentialId },
      {
        $set: {
          "passkeys.$.counter": verification.authenticationInfo.newCounter,
          "passkeys.$.lastUsedAt": new Date(),
        },
      }
    );

    // Issue tokens
    const cfg = getConfig();
    const tokenSvc = await getTokenService();

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

    return res.status(200).json({
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    });
  } catch (err) {
    logger.error("Passkey auth verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Authentication verification failed" });
  }
});

export default router;
