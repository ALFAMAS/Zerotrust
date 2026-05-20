import express from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { UserModel, SessionModel, RefreshTokenModel } from "../../models";
import { TokenService } from "../../services/token.service";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import { ErrorCodes } from "../../shared/types";
import { nanoid } from "nanoid";
import * as nodeCrypto from "crypto";

const router = express.Router();
const logger = getLogger("passkey-routes");

const challengeStore = new Map<string, { challenge: string; userId?: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function storeChallenge(key: string, challenge: string, userId?: string) {
  challengeStore.set(key, { challenge, userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function popChallenge(key: string) {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry;
}

const RP_ID = process.env.RP_ID || "localhost";
const RP_NAME = process.env.RP_NAME || "ZeroAuth";
const RP_ORIGIN = process.env.RP_ORIGIN || "http://localhost:3000";

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

router.post(
  "/register/options",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      const user = await UserModel.findById(req.user!._id);
      if (!user) {
        res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });
        return;
      }

      const existingPasskeys = (user.passkeys || []) as any[];
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: user.email,
        userDisplayName: user.displayName || user.email,
        attestationType: "none",
        excludeCredentials: existingPasskeys.map((pk: any) => ({
          id: pk.credentialId,
          transports: pk.transports as AuthenticatorTransportFuture[],
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      storeChallenge(`reg:${user._id}`, options.challenge, user._id!.toString());
      res.json(options);
    } catch (err) {
      logger.error("Passkey register options error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to generate registration options",
        details: [],
      });
    }
  }
);

router.post(
  "/register",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      const user = await UserModel.findById(req.user!._id);
      if (!user) {
        res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });
        return;
      }

      const stored = popChallenge(`reg:${user._id}`);
      if (!stored) {
        res.status(400).json({
          code: "CHALLENGE_EXPIRED",
          message: "Registration challenge expired. Request new options.",
          details: [],
        });
        return;
      }

      const { body, name } = req.body as any;
      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: stored.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey registration verification failed",
          details: [],
        });
        return;
      }

      const info = verification.registrationInfo;
      const newPasskey = {
        credentialId: Buffer.from(info.credentialID).toString("base64url"),
        publicKey: Buffer.from(info.credentialPublicKey).toString("base64url"),
        counter: info.counter,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        transports: (body.response?.transports as string[]) || [],
        name: name || "Passkey",
        createdAt: new Date(),
      };

      user.passkeys = [...(user.passkeys || []), newPasskey];
      user.mfa.webauthn.enabled = true;
      await user.save();

      res.json({ success: true, credentialId: newPasskey.credentialId });
    } catch (err) {
      logger.error("Passkey register error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Passkey registration failed",
        details: [],
      });
    }
  }
);

router.post(
  "/authenticate/options",
  rateLimit({ points: 20, windowSecs: 60 }),
  async (req, res): Promise<void> => {
    try {
      const { email } = req.body as any;
      let allowCredentials: any[] = [];

      if (email) {
        const user = await UserModel.findOne({ email });
        if (user && user.passkeys?.length) {
          allowCredentials = (user.passkeys as any[]).map((pk: any) => ({
            id: pk.credentialId,
            transports: pk.transports as AuthenticatorTransportFuture[],
          }));
        }
      }

      const challengeKey = `auth:${email || nanoid()}`;
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials,
        userVerification: "preferred",
      });

      storeChallenge(challengeKey, options.challenge);
      res.json({ ...options, challengeKey });
    } catch (err) {
      logger.error("Passkey auth options error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to generate authentication options",
        details: [],
      });
    }
  }
);

router.post(
  "/authenticate",
  rateLimit({ points: 20, windowSecs: 60 }),
  async (req, res): Promise<void> => {
    try {
      const { body, challengeKey } = req.body as any;
      if (!challengeKey) {
        res.status(400).json({
          code: ErrorCodes.INVALID_REQUEST,
          message: "challengeKey is required",
          details: [],
        });
        return;
      }

      const stored = popChallenge(challengeKey);
      if (!stored) {
        res.status(400).json({
          code: "CHALLENGE_EXPIRED",
          message: "Authentication challenge expired",
          details: [],
        });
        return;
      }

      const credentialId = body?.id;
      const user = await UserModel.findOne({ "passkeys.credentialId": credentialId });
      if (!user) {
        res
          .status(401)
          .json({ code: ErrorCodes.PASSKEY_NOT_FOUND, message: "Passkey not found", details: [] });
        return;
      }

      const passkey = (user.passkeys as any[]).find((pk: any) => pk.credentialId === credentialId);
      if (!passkey) {
        res
          .status(401)
          .json({ code: ErrorCodes.PASSKEY_NOT_FOUND, message: "Passkey not found", details: [] });
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: stored.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: passkey.credentialId as string,
          credentialPublicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
      });

      if (!verification.verified) {
        res.status(401).json({
          code: "PASSKEY_VERIFICATION_FAILED",
          message: "Passkey authentication failed",
          details: [],
        });
        return;
      }

      passkey.counter = verification.authenticationInfo.newCounter;
      passkey.lastUsedAt = new Date();
      await user.save();

      const cfg = getConfig();
      const svc = await getTokenSvc();
      const accessToken = await svc.signAccessToken({
        sub: user._id!.toString(),
        email: user.email,
        aud: "zeroauth",
        scope: ["openid"],
      });
      const payload = await svc.verifyAccessToken(accessToken);

      const session = await SessionModel.create({
        userId: user._id,
        tokenId: payload.jti,
        deviceFingerprint: {
          hash: "passkey",
          languages: [],
          isTrusted: true,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] as string,
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      });

      const refreshPlain = await svc.signRefreshToken();
      await RefreshTokenModel.create({
        userId: user._id,
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
      logger.error("Passkey authenticate error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Passkey authentication failed",
        details: [],
      });
    }
  }
);

router.delete(
  "/:credentialId",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      const user = await UserModel.findById(req.user!._id);
      if (!user) {
        res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });
        return;
      }

      const before = user.passkeys.length;
      user.passkeys = (user.passkeys as any[]).filter(
        (pk: any) => pk.credentialId !== req.params.credentialId
      );
      if (user.passkeys.length === before) {
        res
          .status(404)
          .json({ code: ErrorCodes.PASSKEY_NOT_FOUND, message: "Passkey not found", details: [] });
        return;
      }
      if (user.passkeys.length === 0) user.mfa.webauthn.enabled = false;
      await user.save();

      res.json({ success: true });
    } catch (err) {
      logger.error("Passkey delete error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to remove passkey",
        details: [],
      });
    }
  }
);

export default router;
