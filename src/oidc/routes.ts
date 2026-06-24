import * as nodeCrypto from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { getConfig } from "../config/index.js";
import { getDb } from "../db/index.js";
import { refreshTokensTable, sessionsTable, usersTable } from "../db/schema.js";
import { getLogger } from "../logger/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimiting.js";
import { TokenService } from "../services/token.service.js";
import type { HonoEnv } from "../shared/types.js";
import {
  buildUserInfo,
  exchangeAuthCode,
  generateAuthCode,
  getDiscoveryDocument,
  getOIDCClient,
  isRegisteredRedirectUri,
  validateAuthorizeRequest,
} from "./provider.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("oidc-routes");

const ISSUER = process.env.OIDC_ISSUER ?? process.env.APP_URL ?? "http://localhost:3000";

let tokenServiceInstance: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

function hashToken(token: string): string {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

// ─── Discovery ────────────────────────────────────────────────────────────────

router.get("/.well-known/openid-configuration", (c) => {
  return c.json(getDiscoveryDocument(ISSUER));
});

// ─── JWKS ─────────────────────────────────────────────────────────────────────

router.get("/oidc/jwks", (c) => {
  // PASETO symmetric key — advertise empty JWKS (tokens verified internally)
  return c.json({ keys: [] });
});

// ─── Authorization Endpoint ───────────────────────────────────────────────────

router.get("/oidc/authorize", rateLimit({ points: 30, windowSecs: 60 }), (c) => {
  const client_id = c.req.query("client_id") ?? "";
  const redirect_uri = c.req.query("redirect_uri") ?? "";
  const response_type = c.req.query("response_type") ?? "";
  const scope = c.req.query("scope") ?? "";
  const state = c.req.query("state");
  const nonce = c.req.query("nonce");
  const code_challenge = c.req.query("code_challenge");
  const code_challenge_method = c.req.query("code_challenge_method");
  const login_hint = c.req.query("login_hint");

  if (!client_id || !redirect_uri || !response_type || !scope) {
    return c.json(
      {
        code: "INVALID_REQUEST",
        message: "Missing required params: client_id, redirect_uri, response_type, scope",
        details: [],
      },
      400
    );
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
    // Only bounce the error back to the client when the redirect_uri is one the
    // client actually registered. Otherwise the redirect_uri is attacker-chosen
    // and redirecting to it is an open redirect that leaks error/state params.
    if (!isRegisteredRedirectUri(client_id, redirect_uri)) {
      return c.json(
        { code: validation.error, message: validation.errorDescription, details: [] },
        400
      );
    }
    const errorUrl = new URL(redirect_uri);
    errorUrl.searchParams.set("error", validation.error ?? "invalid_request");
    errorUrl.searchParams.set("error_description", validation.errorDescription ?? "");
    if (state) errorUrl.searchParams.set("state", state);
    return c.redirect(errorUrl.toString());
  }

  // Redirect to login, preserving OIDC params
  const loginUrl = new URL(process.env.LOGIN_URL ?? "/auth/login", ISSUER);
  loginUrl.searchParams.set("return_to", c.req.url);
  if (login_hint) loginUrl.searchParams.set("email", login_hint);

  return c.redirect(loginUrl.toString());
});

// ─── Authorization via authenticated session (internal use) ──────────────────

router.post(
  "/oidc/authorize/consent",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, string>;
      const {
        client_id,
        redirect_uri,
        scope,
        state,
        nonce,
        code_challenge,
        code_challenge_method,
      } = body;

      if (!client_id || !redirect_uri || !scope) {
        return c.json({ code: "INVALID_REQUEST", message: "Missing params", details: [] }, 400);
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
        return c.json(
          { code: validation.error, message: validation.errorDescription, details: [] },
          400
        );
      }

      const user = c.get("user");
      const code = generateAuthCode(client_id, user.id, scope, redirect_uri, {
        nonce,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      });

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      if (state) callbackUrl.searchParams.set("state", state);

      return c.json({ redirectTo: callbackUrl.toString() });
    } catch (err) {
      logger.warn("OIDC consent error", { error: String(err) });
      return c.json({ code: "INTERNAL_ERROR", message: "Authorization failed", details: [] }, 500);
    }
  }
);

// ─── Token Endpoint ───────────────────────────────────────────────────────────

router.post("/oidc/token", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, string>;
    const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = body;

    // Support Basic auth for client credentials
    let resolvedClientId = client_id;
    let resolvedClientSecret = client_secret;
    const authHeader = c.req.header("authorization") ?? "";
    if (authHeader.startsWith("Basic ")) {
      const [id, secret] = Buffer.from(authHeader.slice(6), "base64").toString().split(":");
      resolvedClientId = id ?? resolvedClientId;
      resolvedClientSecret = secret ?? resolvedClientSecret;
    }

    if (grant_type !== "authorization_code") {
      return c.json(
        {
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant is supported",
        },
        400
      );
    }

    if (!code || !redirect_uri || !resolvedClientId) {
      return c.json({ error: "invalid_request", error_description: "Missing params" }, 400);
    }

    const client = getOIDCClient(resolvedClientId);
    if (!client) {
      return c.json({ error: "invalid_client", error_description: "Unknown client" }, 401);
    }

    if (client.clientSecret && client.clientSecret !== resolvedClientSecret) {
      return c.json({ error: "invalid_client", error_description: "Invalid client secret" }, 401);
    }

    const codeData = exchangeAuthCode(code, resolvedClientId, redirect_uri, code_verifier);
    if (!codeData) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Code is invalid, expired, or already used",
        },
        400
      );
    }

    // Look up user in Postgres
    const db = getDb();
    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, codeData.userId))
      .limit(1);

    if (userRows.length === 0 || userRows[0].status !== "active") {
      return c.json(
        { error: "invalid_grant", error_description: "User not found or inactive" },
        400
      );
    }

    const userRow = userRows[0];
    const svc = await getTokenService();
    const cfg = getConfig();

    const accessToken = await svc.signAccessToken({
      sub: userRow.id,
      email: userRow.email,
      sid: nanoid(),
      aud: resolvedClientId,
      scope: codeData.scope,
    });

    const tokenPayload = await svc.verifyAccessToken(accessToken);

    // Persist session
    await db.insert(sessionsTable).values({
      userId: userRow.id,
      tokenId: tokenPayload.jti,
      deviceFingerprint: {
        hash: "oidc",
        languages: [],
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: "oidc",
      expiresAt: new Date(tokenPayload.exp * 1000),
      isActive: true,
    });

    const refreshPlain = await svc.signRefreshToken();

    // Find the session we just inserted
    const sessionRows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.tokenId, tokenPayload.jti))
      .limit(1);

    if (sessionRows.length > 0) {
      await db.insert(refreshTokensTable).values({
        userId: userRow.id,
        sessionId: sessionRows[0].id,
        tokenHash: hashToken(refreshPlain),
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });
    }

    return c.json({
      access_token: accessToken,
      refresh_token: refreshPlain,
      token_type: "Bearer",
      expires_in: cfg.session.defaultTTL,
      scope: codeData.scope.join(" "),
    });
  } catch (err) {
    logger.warn("OIDC token exchange error", { error: String(err) });
    return c.json({ error: "server_error", error_description: "Token exchange failed" }, 500);
  }
});

// ─── UserInfo Endpoint ────────────────────────────────────────────────────────

router.get(
  "/oidc/userinfo",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  async (c) => {
    try {
      const contextUser = c.get("user");
      const db = getDb();
      const userRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, contextUser.id))
        .limit(1);

      if (userRows.length === 0) {
        return c.json({ error: "not_found" }, 404);
      }

      const userRow = userRows[0];
      const token = c.get("token");
      const scopes = token.scope ?? ["openid", "profile", "email"];

      return c.json(
        buildUserInfo(
          {
            id: userRow.id,
            email: userRow.email,
            displayName: userRow.displayName,
            username: userRow.username,
            phone: userRow.phone,
            status: userRow.status,
            updatedAt: userRow.updatedAt,
          },
          scopes
        )
      );
    } catch (err) {
      logger.warn("OIDC userinfo error", { error: String(err) });
      return c.json({ error: "server_error" }, 500);
    }
  }
);

// ─── End Session (Logout) ─────────────────────────────────────────────────────

router.get("/oidc/logout", (c) => {
  const post_logout_redirect_uri = c.req.query("post_logout_redirect_uri");
  const state = c.req.query("state");
  const logoutUrl = new URL(post_logout_redirect_uri ?? ISSUER);
  if (state) logoutUrl.searchParams.set("state", state);
  return c.redirect(logoutUrl.toString());
});

export default router;
