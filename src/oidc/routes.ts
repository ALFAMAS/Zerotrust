import express from "express";
import {
  validateAuthorizeRequest,
  issueAuthCode,
  exchangeCode,
  buildUserInfo,
  getDiscoveryDocument,
  getOIDCClient,
} from "./provider";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimiting";
import { UserModel } from "../models/user.model";
import { TokenService } from "../services/token.service";
import { getConfig } from "../config";
import { getLogger } from "../logger";

const router = express.Router();
const logger = getLogger("oidc-routes");

const ISSUER = process.env.OIDC_ISSUER || process.env.APP_BASE_URL || "http://localhost:3000";

let tokenSvc: TokenService | null = null;
async function getTokenSvc() {
  if (tokenSvc) return tokenSvc;
  const cfg = getConfig();
  tokenSvc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenSvc.init();
  return tokenSvc;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

router.get("/.well-known/openid-configuration", (_req, res) => {
  res.json(getDiscoveryDocument(ISSUER));
});

// ─── JWKS ─────────────────────────────────────────────────────────────────────

router.get("/jwks", (_req, res) => {
  // PASETO symmetric key — advertise empty JWKS (tokens verified internally)
  res.json({ keys: [] });
});

// ─── Authorization Endpoint ───────────────────────────────────────────────────

router.get("/authorize", rateLimit({ points: 30, windowSecs: 60 }), (req, res) => {
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method,
    login_hint,
  } = req.query as Record<string, string>;

  if (!client_id || !redirect_uri || !response_type || !scope) {
    return res.status(400).json({
      code: "INVALID_REQUEST",
      message: "Missing required params: client_id, redirect_uri, response_type, scope",
      details: [],
    });
  }

  const validation = validateAuthorizeRequest({
    clientId: client_id,
    redirectUri: redirect_uri,
    responseType: response_type,
    scope,
    state,
    nonce,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
  });

  if (!validation.valid) {
    const errorUrl = new URL(redirect_uri);
    errorUrl.searchParams.set("error", validation.error!);
    errorUrl.searchParams.set("error_description", validation.errorDescription!);
    if (state) errorUrl.searchParams.set("state", state);
    return res.redirect(errorUrl.toString());
  }

  // If not authenticated, redirect to login, preserving OIDC params
  const loginUrl = new URL(process.env.LOGIN_URL || "/auth/login", ISSUER);
  loginUrl.searchParams.set("return_to", req.url);
  if (login_hint) loginUrl.searchParams.set("email", login_hint);

  res.redirect(loginUrl.toString());
});

// ─── Authorization via authenticated session (internal use) ──────────────────

router.post(
  "/authorize/consent",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      const {
        client_id,
        redirect_uri,
        scope,
        state,
        nonce,
        code_challenge,
        code_challenge_method,
      } = req.body as Record<string, string>;

      if (!client_id || !redirect_uri || !scope) {
        res.status(400).json({ code: "INVALID_REQUEST", message: "Missing params", details: [] });
        return;
      }

      const validation = validateAuthorizeRequest({
        clientId: client_id,
        redirectUri: redirect_uri,
        responseType: "code",
        scope,
        state,
        nonce,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      });

      if (!validation.valid) {
        res.status(400).json({
          code: validation.error,
          message: validation.errorDescription,
          details: [],
        });
        return;
      }

      const { code } = await issueAuthCode(req.user!._id.toString(), {
        clientId: client_id,
        redirectUri: redirect_uri,
        responseType: "code",
        scope,
        state,
        nonce,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      });

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      if (state) callbackUrl.searchParams.set("state", state);

      res.json({ redirectTo: callbackUrl.toString() });
    } catch (err) {
      logger.error("OIDC consent error", err as Error);
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Authorization failed", details: [] });
    }
  }
);

// ─── Token Endpoint ───────────────────────────────────────────────────────────

router.post("/token", rateLimit({ points: 20, windowSecs: 60 }), async (req, res): Promise<void> => {
  try {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret,
      code_verifier,
    } = req.body as Record<string, string>;

    // Support Basic auth for client credentials
    let resolvedClientId = client_id;
    let resolvedClientSecret = client_secret;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Basic ")) {
      const [id, secret] = Buffer.from(authHeader.slice(6), "base64").toString().split(":");
      resolvedClientId = id;
      resolvedClientSecret = secret;
    }

    if (grant_type !== "authorization_code") {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Only authorization_code grant is supported",
      });
      return;
    }

    if (!code || !redirect_uri || !resolvedClientId) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing params" });
      return;
    }

    const client = getOIDCClient(resolvedClientId);
    if (!client) {
      res.status(401).json({ error: "invalid_client", error_description: "Unknown client" });
      return;
    }

    if (client.clientSecret && client.clientSecret !== resolvedClientSecret) {
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client secret" });
      return;
    }

    const tokens = await exchangeCode(code, resolvedClientId, redirect_uri, code_verifier);
    if (!tokens) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Code is invalid, expired, or already used",
      });
      return;
    }

    res.json(tokens);
  } catch (err) {
    logger.error("OIDC token exchange error", err as Error);
    res.status(500).json({ error: "server_error", error_description: "Token exchange failed" });
  }
});

// ─── UserInfo Endpoint ────────────────────────────────────────────────────────

router.get("/userinfo", rateLimit({ points: 60, windowSecs: 60 }), authMiddleware, async (req, res): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const scopes = (req.user as any).scope ?? ["openid", "profile", "email"];
    res.json(buildUserInfo(user, scopes));
  } catch (err) {
    logger.error("OIDC userinfo error", err as Error);
    res.status(500).json({ error: "server_error" });
  }
});

// ─── End Session (Logout) ─────────────────────────────────────────────────────

router.get("/logout", (req, res) => {
  const { post_logout_redirect_uri, id_token_hint, state } = req.query as Record<string, string>;
  const logoutUrl = new URL(post_logout_redirect_uri || ISSUER);
  if (state) logoutUrl.searchParams.set("state", state);
  res.redirect(logoutUrl.toString());
});

export default router;
