import express from "express";
import { buildAuthnRequest, parseSAMLResponse, consumeRelayState, buildSPMetadata } from "./sp";
import { UserModel, SessionModel, RefreshTokenModel } from "../models";
import { TokenService } from "../services/token.service";
import { getConfig } from "../config";
import { rateLimit } from "../middleware/rateLimiting";
import { getLogger } from "../logger";
import * as nodeCrypto from "crypto";

const router = express.Router();
const logger = getLogger("saml-routes");

const SP_ENTITY_ID = process.env.SAML_SP_ENTITY_ID || "http://localhost:3000/saml/metadata";
const ACS_URL = process.env.SAML_ACS_URL || "http://localhost:3000/saml/acs";
const IDP_ENTITY_ID = process.env.SAML_IDP_ENTITY_ID || "";
const IDP_SSO_URL = process.env.SAML_IDP_SSO_URL || "";
const IDP_CERT = process.env.SAML_IDP_CERT || "";

const spConfig = {
  entityId: SP_ENTITY_ID,
  assertionConsumerServiceUrl: ACS_URL,
};

const idpConfig = {
  entityId: IDP_ENTITY_ID,
  ssoUrl: IDP_SSO_URL,
  certificate: IDP_CERT,
};

let tokenSvc: TokenService | null = null;
async function getTokenSvc() {
  if (tokenSvc) return tokenSvc;
  const cfg = getConfig();
  tokenSvc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenSvc.init();
  return tokenSvc;
}

function hashToken(token: string): string {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

// ─── SP Metadata ──────────────────────────────────────────────────────────────

router.get("/metadata", (_req, res) => {
  const xml = buildSPMetadata(spConfig);
  res.type("application/xml").send(xml);
});

// ─── SP-Initiated Login ───────────────────────────────────────────────────────

router.get(
  "/login",
  rateLimit({ points: 20, windowSecs: 60 }),
  (req, res) => {
    if (!IDP_SSO_URL) {
      return res.status(503).json({
        code: "SAML_NOT_CONFIGURED",
        message: "SAML IdP is not configured. Set SAML_IDP_* env vars.",
        details: [],
      });
    }

    const { redirect } = req.query as Record<string, string>;
    const { redirectUrl, relayState } = buildAuthnRequest(spConfig, idpConfig, {
      redirectUrl: redirect,
    });

    res.redirect(redirectUrl);
  }
);

// ─── Assertion Consumer Service (POST binding) ───────────────────────────────

router.post(
  "/acs",
  rateLimit({ points: 20, windowSecs: 60 }),
  express.urlencoded({ extended: true }),
  async (req, res): Promise<void> => {
    try {
      const { SAMLResponse, RelayState } = req.body as Record<string, string>;

      if (!SAMLResponse) {
        res.status(400).json({
          code: "INVALID_REQUEST",
          message: "SAMLResponse is required",
          details: [],
        });
        return;
      }

      const relayEntry = RelayState ? consumeRelayState(RelayState) : null;

      let assertion;
      try {
        assertion = parseSAMLResponse(SAMLResponse, idpConfig, spConfig);
      } catch (parseErr) {
        logger.warn("SAML assertion parse failed", parseErr as Error);
        res.status(401).json({
          code: "SAML_ASSERTION_INVALID",
          message: (parseErr as Error).message,
          details: [],
        });
        return;
      }

      // Map NameID or attributes to email
      const email =
        assertion.nameId.includes("@")
          ? assertion.nameId
          : (assertion.attributes["email"] as string) ||
            (assertion.attributes[
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
            ] as string);

      if (!email) {
        res.status(400).json({
          code: "SAML_NO_EMAIL",
          message: "IdP did not provide an email in the assertion",
          details: [],
        });
        return;
      }

      const displayName =
        (assertion.attributes["displayName"] as string) ||
        (assertion.attributes["name"] as string) ||
        (assertion.attributes[
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
        ] as string) ||
        email.split("@")[0];

      // Provision or retrieve user
      let user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) {
        user = await UserModel.create({
          email: email.toLowerCase(),
          displayName,
          roles: ["user"],
          status: "active",
          oauthProviders: [],
          passkeys: [],
          mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
          attributes: {},
          sessionConfig: {
            maxDevices: 5,
            allowedCountries: [],
            allowedIpRanges: [],
            scheduleRestriction: { enabled: false, timezone: "UTC", allowedDays: [], allowedHoursStart: 0, allowedHoursEnd: 23 },
          },
        } as any);
      }

      const svc = await getTokenSvc();
      const cfg = getConfig();

      const accessToken = await svc.signAccessToken({
        sub: user._id.toString(),
        email: user.email,
        aud: "zeroauth",
        scope: ["openid"],
      });
      const payload = await svc.verifyAccessToken(accessToken);

      await SessionModel.create({
        userId: user._id,
        tokenId: payload.jti,
        deviceFingerprint: { hash: "saml", languages: [], isTrusted: false, firstSeenAt: new Date(), lastSeenAt: new Date() },
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        expiresAt: new Date(payload.exp * 1000),
        lastActivityAt: new Date(),
        isActive: true,
      });

      const refreshPlain = await svc.signRefreshToken();
      await RefreshTokenModel.create({
        userId: user._id,
        sessionId: (await SessionModel.findOne({ tokenId: payload.jti }))?._id,
        tokenHash: hashToken(refreshPlain),
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });

      const redirectTo = relayEntry?.redirectUrl || process.env.LOGIN_SUCCESS_URL || "/";
      const successUrl = new URL(redirectTo, process.env.APP_BASE_URL || "http://localhost:3000");
      successUrl.searchParams.set("access_token", accessToken);
      successUrl.searchParams.set("refresh_token", refreshPlain);

      res.redirect(successUrl.toString());
    } catch (err) {
      logger.error("SAML ACS error", err as Error);
      res.status(500).json({ code: "INTERNAL_ERROR", message: "SAML login failed", details: [] });
    }
  }
);

export default router;
