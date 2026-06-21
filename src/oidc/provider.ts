/**
 * ZeroAuth OIDC Provider
 *
 * Implements RFC 6749 (OAuth 2.0) + OpenID Connect Core 1.0.
 * Exposes ZeroAuth itself as an identity provider so other apps
 * can authenticate users via standard OIDC flows.
 */
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getLogger } from "../logger/index.js";

const logger = getLogger("oidc-provider");

// ─── Client Registry ──────────────────────────────────────────────────────────

export interface OIDCClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  grants: string[];
  scopes: string[];
  name: string;
  pkceRequired: boolean;
}

const clientStore = new Map<string, OIDCClient>();

export function registerOIDCClient(client: {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  grants?: string[];
  scopes?: string[];
  name: string;
  pkceRequired?: boolean;
}): void {
  clientStore.set(client.clientId, {
    ...client,
    grants: client.grants ?? ["authorization_code"],
    scopes: client.scopes ?? ["openid", "profile", "email"],
    pkceRequired: client.pkceRequired ?? false,
  });
}

export function getOIDCClient(clientId: string): OIDCClient | null {
  return clientStore.get(clientId) ?? null;
}

// ─── Auth Code Store ──────────────────────────────────────────────────────────

interface AuthCodeEntry {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function generateAuthCode(
  clientId: string,
  userId: string,
  scope: string,
  redirectUri: string,
  opts?: { nonce?: string; codeChallenge?: string; codeChallengeMethod?: string }
): string {
  const code = nanoid(32);
  authCodes.set(code, {
    userId,
    clientId,
    redirectUri,
    scope: scope.split(" "),
    nonce: opts?.nonce,
    codeChallenge: opts?.codeChallenge,
    codeChallengeMethod: opts?.codeChallengeMethod,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

export function exchangeAuthCode(
  code: string,
  clientId?: string,
  redirectUri?: string,
  codeVerifier?: string
): { userId: string; scope: string[]; clientId: string; nonce?: string } | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  authCodes.delete(code);

  if (entry.expiresAt < Date.now()) return null;
  if (clientId && entry.clientId !== clientId) return null;
  if (redirectUri && entry.redirectUri !== redirectUri) return null;

  // PKCE verification
  if (entry.codeChallenge) {
    if (!codeVerifier) {
      logger.warn("PKCE code_verifier missing");
      return null;
    }
    const method = entry.codeChallengeMethod ?? "S256";
    const computed =
      method === "S256"
        ? crypto.createHash("sha256").update(codeVerifier).digest("base64url")
        : codeVerifier;
    if (computed !== entry.codeChallenge) {
      logger.warn("PKCE verification failed");
      return null;
    }
  }

  return { userId: entry.userId, scope: entry.scope, clientId: entry.clientId, nonce: entry.nonce };
}

// ─── Authorize Request Validation ─────────────────────────────────────────────

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export function validateAuthorizeRequest(params: AuthorizeParams): {
  valid: boolean;
  error?: string;
  errorDescription?: string;
} {
  const client = clientStore.get(params.clientId);
  if (!client) {
    return { valid: false, error: "invalid_client", errorDescription: "Unknown client_id" };
  }

  if (!client.redirectUris.includes(params.redirectUri)) {
    return {
      valid: false,
      error: "invalid_request",
      errorDescription: "redirect_uri not registered",
    };
  }

  if (params.responseType !== "code") {
    return {
      valid: false,
      error: "unsupported_response_type",
      errorDescription: "Only code flow is supported",
    };
  }

  if (client.pkceRequired && !params.codeChallenge) {
    return { valid: false, error: "invalid_request", errorDescription: "PKCE required" };
  }

  const requestedScopes = params.scope.split(" ");
  const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
  if (invalidScopes.length > 0) {
    return {
      valid: false,
      error: "invalid_scope",
      errorDescription: `Unsupported scopes: ${invalidScopes.join(", ")}`,
    };
  }

  return { valid: true };
}

// ─── Discovery Document ────────────────────────────────────────────────────────

export function getDiscoveryDocument(issuerUrl: string): Record<string, unknown> {
  return {
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/oidc/authorize`,
    token_endpoint: `${issuerUrl}/oidc/token`,
    userinfo_endpoint: `${issuerUrl}/oidc/userinfo`,
    jwks_uri: `${issuerUrl}/oidc/jwks`,
    end_session_endpoint: `${issuerUrl}/oidc/logout`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    scopes_supported: ["openid", "profile", "email", "phone"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    claims_supported: [
      "sub",
      "email",
      "email_verified",
      "name",
      "preferred_username",
      "phone_number",
    ],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
  };
}

// ─── UserInfo Builder ─────────────────────────────────────────────────────────

export function buildUserInfo(
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    username?: string | null;
    phone?: string | null;
    status: string;
    updatedAt?: Date | null;
  },
  scopes: string[]
): Record<string, unknown> {
  const info: Record<string, unknown> = { sub: user.id };

  if (scopes.includes("email")) {
    info.email = user.email;
    info.email_verified = user.status === "active";
  }

  if (scopes.includes("profile")) {
    info.name = user.displayName;
    info.preferred_username = user.username ?? user.email;
    info.updated_at = user.updatedAt ? Math.floor(user.updatedAt.getTime() / 1000) : 0;
  }

  if (scopes.includes("phone") && user.phone) {
    info.phone_number = user.phone;
  }

  return info;
}
