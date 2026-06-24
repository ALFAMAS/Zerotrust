/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// @zerotrust/client — AUTO-GENERATED from src/api/openapi.json. DO NOT EDIT.
// Regenerate with `bun run sdk:generate`.
// zerotrust API v1.0.0
// ─────────────────────────────────────────────────────────────────────────────

// ── Schema types ──
export interface ErrorEnvelope {
  code: string;
  message: string;
  details: { field?: string; message?: string }[];
}

export interface TokenResponse {
  /** PASETO v4.local access token */
  accessToken?: string;
  refreshToken?: string;
  /** Access token TTL in seconds */
  expiresIn?: number;
  tokenType?: "Bearer";
}

export interface Session {
  id?: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  isActive?: boolean;
  isCurrent?: boolean;
  lastActivityAt?: string;
  createdAt?: string;
  deviceFingerprint?: { platform?: string; browser?: string; os?: string };
}

// ── Runtime ──
/**
 * Options for constructing a {@link zerotrustClient}.
 */
export interface zerotrustClientOptions {
  /** API base URL, e.g. "https://api.zerotrust.app". Defaults to the spec server. */
  baseUrl?: string;
  /** Bearer token (PASETO) sent as the Authorization header on every request. */
  token?: string;
  /** Custom fetch implementation (defaults to the global fetch). */
  fetch?: typeof fetch;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
}

export interface zerotrustRequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Thrown for any non-2xx response. Carries the HTTP status and parsed body. */
export class zerotrustError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "zerotrustError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ── Client ──
/**
 * Typed client for the zerotrust API (v1.0.0).
 * Auto-generated — do not edit by hand. Regenerate with `bun run sdk:generate`.
 */
export class zerotrustClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private defaultHeaders: Record<string, string>;
  token?: string;

  constructor(options: zerotrustClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    );
    this.token = options.token;
    const f = options.fetch ?? globalThis.fetch;
    if (!f)
      throw new Error("No fetch implementation available; pass options.fetch");
    this.fetchImpl = f.bind(globalThis);
    this.defaultHeaders = options.headers ?? {};
  }

  /** Update the bearer token used for subsequent requests. */
  setToken(token: string | undefined): void {
    this.token = token;
  }

  /** Low-level request helper used by every generated method. */
  async request<T>(
    method: string,
    path: string,
    options: zerotrustRequestOptions = {},
  ): Promise<T> {
    let url = this.baseUrl + path;
    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) sp.append(k, String(v));
      }
      const qs = sp.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(options.body);
    }

    const res = await this.fetchImpl(url, { method, headers, body });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const env = parsed as
        | { code?: string; message?: string; error?: string; details?: unknown }
        | undefined;
      throw new zerotrustError(
        env?.message ??
          env?.error ??
          `Request failed with status ${res.status}`,
        res.status,
        env?.code ?? env?.error,
        env?.details ?? parsed,
      );
    }
    return parsed as T;
  }

  /**
   * Register a new user
   *
   * @route POST /auth/register
   */
  postAuthRegister(body: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ success?: boolean; userId?: string }> {
    return this.request("POST", `/auth/register`, { body });
  }

  /**
   * Login with email and password
   *
   * @route POST /auth/login
   */
  postAuthLogin(body: {
    email: string;
    password: string;
  }): Promise<TokenResponse> {
    return this.request("POST", `/auth/login`, { body });
  }

  /**
   * Rotate refresh token and issue new access token
   *
   * @route POST /auth/token/refresh
   */
  postAuthTokenRefresh(body: { refreshToken: string }): Promise<TokenResponse> {
    return this.request("POST", `/auth/token/refresh`, { body });
  }

  /**
   * Revoke current session
   *
   * @route POST /auth/logout
   */
  postAuthLogout(): Promise<{ success?: boolean }> {
    return this.request("POST", `/auth/logout`);
  }

  /**
   * Revoke all sessions for the authenticated user
   *
   * @route POST /auth/logout/all
   */
  postAuthLogoutAll(): Promise<{ success?: boolean }> {
    return this.request("POST", `/auth/logout/all`);
  }

  /**
   * Generate an ephemeral OAuth state token (PKCE/nonce)
   *
   * @route POST /auth/oauth/state
   */
  postAuthOauthState(body?: {
    codeChallenge?: string;
    redirectUri?: string;
  }): Promise<{ state?: string; nonce?: string; ttlSeconds?: number }> {
    return this.request("POST", `/auth/oauth/state`, { body });
  }

  /**
   * Begin OAuth authorization flow (returns the provider's authorize URL)
   *
   * Generates a CSRF state and (where supported) a server-side PKCE pair, then returns the provider authorization URL the client should navigate to. The PKCE code_verifier never leaves the server.
   *
   * @route GET /auth/oauth/{provider}/authorize
   * @param provider path parameter
   */
  getAuthOauthByProviderAuthorize(
    provider: "google" | "github" | "facebook",
  ): Promise<{ authorizeUrl?: string; state?: string }> {
    return this.request(
      "GET",
      `/auth/oauth/${encodeURIComponent(provider)}/authorize`,
    );
  }

  /**
   * OAuth authorization code callback
   *
   * Provider redirects here with an authorization code. On success the server creates a session, stores the tokens under a one-time exchange code, and 302-redirects to the frontend at /login?oauth_code=<code>. The SPA redeems it via POST /auth/oauth/exchange.
   *
   * @route GET /auth/oauth/{provider}/callback
   * @param provider path parameter
   */
  getAuthOauthByProviderCallback(
    provider: "google" | "github" | "facebook",
    query: { code: string; state: string },
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/auth/oauth/${encodeURIComponent(provider)}/callback`,
      { query },
    );
  }

  /**
   * Redeem a one-time OAuth exchange code for tokens
   *
   * Exchanges the single-use code delivered to /login?oauth_code=<code> for the access and refresh tokens. Keeps tokens out of the URL/history.
   *
   * @route POST /auth/oauth/exchange
   */
  postAuthOauthExchange(body: {
    code: string;
  }): Promise<{ accessToken?: string; refreshToken?: string }> {
    return this.request("POST", `/auth/oauth/exchange`, { body });
  }

  /**
   * Request a password reset OTP
   *
   * @route POST /auth/password-reset/request
   */
  postAuthPasswordResetRequest(body: {
    email: string;
    channel?: "email" | "sms" | "whatsapp" | "telegram";
  }): Promise<{ success?: boolean; message?: string }> {
    return this.request("POST", `/auth/password-reset/request`, { body });
  }

  /**
   * Confirm password reset with OTP
   *
   * @route POST /auth/password-reset/confirm
   */
  postAuthPasswordResetConfirm(body: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ success?: boolean }> {
    return this.request("POST", `/auth/password-reset/confirm`, { body });
  }

  /**
   * Get WebAuthn registration options
   *
   * @route POST /auth/passkey/register/options
   */
  postAuthPasskeyRegisterOptions(): Promise<unknown> {
    return this.request("POST", `/auth/passkey/register/options`);
  }

  /**
   * Complete WebAuthn registration
   *
   * @route POST /auth/passkey/register
   */
  postAuthPasskeyRegister(body: {
    body: Record<string, unknown>;
    name?: string;
  }): Promise<{ success?: boolean; credentialId?: string }> {
    return this.request("POST", `/auth/passkey/register`, { body });
  }

  /**
   * Get WebAuthn authentication options
   *
   * @route POST /auth/passkey/authenticate/options
   */
  postAuthPasskeyAuthenticateOptions(body?: {
    email?: string;
  }): Promise<unknown> {
    return this.request("POST", `/auth/passkey/authenticate/options`, { body });
  }

  /**
   * Complete WebAuthn authentication
   *
   * @route POST /auth/passkey/authenticate
   */
  postAuthPasskeyAuthenticate(body: {
    body: Record<string, unknown>;
    challengeKey: string;
  }): Promise<TokenResponse> {
    return this.request("POST", `/auth/passkey/authenticate`, { body });
  }

  /**
   * Remove a registered passkey
   *
   * @route DELETE /auth/passkey/{credentialId}
   * @param credentialId path parameter
   */
  deleteAuthPasskeyByCredentialId(credentialId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/auth/passkey/${encodeURIComponent(credentialId)}`,
    );
  }

  /**
   * Initialize TOTP setup — returns secret and QR code
   *
   * @route POST /auth/mfa/totp/setup
   */
  postAuthMfaTotpSetup(): Promise<{
    secret?: string;
    otpAuthUrl?: string;
    qrDataUrl?: string;
  }> {
    return this.request("POST", `/auth/mfa/totp/setup`);
  }

  /**
   * Verify TOTP code and activate TOTP MFA
   *
   * @route POST /auth/mfa/totp/verify
   */
  postAuthMfaTotpVerify(body: {
    code: string;
  }): Promise<{ success?: boolean; backupCodes?: string[] }> {
    return this.request("POST", `/auth/mfa/totp/verify`, { body });
  }

  /**
   * Disable TOTP (requires valid TOTP code)
   *
   * @route POST /auth/mfa/totp/disable
   */
  postAuthMfaTotpDisable(body: { code: string }): Promise<unknown> {
    return this.request("POST", `/auth/mfa/totp/disable`, { body });
  }

  /**
   * Regenerate backup codes (invalidates existing ones)
   *
   * @route POST /auth/mfa/backup-codes/regenerate
   */
  postAuthMfaBackupCodesRegenerate(body: {
    code: string;
  }): Promise<{ backupCodes?: string[] }> {
    return this.request("POST", `/auth/mfa/backup-codes/regenerate`, { body });
  }

  /**
   * Redeem a backup code for authentication
   *
   * @route POST /auth/mfa/backup-codes/redeem
   */
  postAuthMfaBackupCodesRedeem(body: {
    code: string;
  }): Promise<{ success?: boolean; remainingCodes?: number }> {
    return this.request("POST", `/auth/mfa/backup-codes/redeem`, { body });
  }

  /**
   * Send OTP via email, SMS, WhatsApp, or Telegram
   *
   * @route POST /auth/mfa/otp/send
   */
  postAuthMfaOtpSend(body: {
    channel: "email" | "sms" | "whatsapp" | "telegram";
    target: string;
  }): Promise<{ success?: boolean; expiresIn?: number }> {
    return this.request("POST", `/auth/mfa/otp/send`, { body });
  }

  /**
   * Verify channel OTP
   *
   * @route POST /auth/mfa/otp/verify
   */
  postAuthMfaOtpVerify(body: {
    code: string;
    channel: "email" | "sms" | "whatsapp" | "telegram";
  }): Promise<unknown> {
    return this.request("POST", `/auth/mfa/otp/verify`, { body });
  }

  /**
   * List active sessions for authenticated user
   *
   * @route GET /sessions
   */
  getSessions(query?: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  }): Promise<{
    sessions?: Session[];
    total?: number;
    limit?: number;
    offset?: number;
  }> {
    return this.request("GET", `/sessions`, { query });
  }

  /**
   * Revoke all other sessions (keep current)
   *
   * @route DELETE /sessions
   */
  deleteSessions(): Promise<{ success?: boolean; revokedCount?: number }> {
    return this.request("DELETE", `/sessions`);
  }

  /**
   * Revoke a specific session
   *
   * @route DELETE /sessions/{id}
   * @param id path parameter
   */
  deleteSessionsById(id: string): Promise<unknown> {
    return this.request("DELETE", `/sessions/${encodeURIComponent(id)}`);
  }

  /**
   * Issue a short-lived scoped workload credential
   *
   * @route POST /workload/credentials
   */
  postWorkloadCredentials(): Promise<unknown> {
    return this.request("POST", `/workload/credentials`);
  }

  /**
   * Validate a workload credential
   *
   * @route POST /workload/validate
   */
  postWorkloadValidate(): Promise<unknown> {
    return this.request("POST", `/workload/validate`);
  }

  /**
   * List all users (admin only)
   *
   * @route GET /admin/users
   */
  getAdminUsers(query?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<unknown> {
    return this.request("GET", `/admin/users`, { query });
  }

  /**
   * Get user by ID (admin only)
   *
   * @route GET /admin/users/{id}
   * @param id path parameter
   */
  getAdminUsersById(id: string): Promise<unknown> {
    return this.request("GET", `/admin/users/${encodeURIComponent(id)}`);
  }

  /**
   * Update user status, roles, or displayName (admin only)
   *
   * @route PATCH /admin/users/{id}
   * @param id path parameter
   */
  patchAdminUsersById(
    id: string,
    body?: {
      status?: "active" | "suspended" | "deleted";
      roles?: string[];
      displayName?: string;
    },
  ): Promise<unknown> {
    return this.request("PATCH", `/admin/users/${encodeURIComponent(id)}`, {
      body,
    });
  }

  /**
   * Soft-delete user and revoke all sessions (admin only)
   *
   * @route DELETE /admin/users/{id}
   * @param id path parameter
   */
  deleteAdminUsersById(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/users/${encodeURIComponent(id)}`);
  }

  /**
   * Assign role to user (admin only)
   *
   * @route POST /admin/users/{id}/roles
   * @param id path parameter
   */
  postAdminUsersByIdRoles(
    id: string,
    body: { roleName: string },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/admin/users/${encodeURIComponent(id)}/roles`,
      { body },
    );
  }

  /**
   * Remove role from user (admin only)
   *
   * @route DELETE /admin/users/{id}/roles/{roleName}
   * @param id path parameter
   * @param roleName path parameter
   */
  deleteAdminUsersByIdRolesByRoleName(
    id: string,
    roleName: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `/admin/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleName)}`,
    );
  }

  /**
   * List all sessions for a user (admin only)
   *
   * @route GET /admin/users/{id}/sessions
   * @param id path parameter
   */
  getAdminUsersByIdSessions(id: string): Promise<unknown> {
    return this.request(
      "GET",
      `/admin/users/${encodeURIComponent(id)}/sessions`,
    );
  }

  /**
   * Revoke all sessions for a user (admin only)
   *
   * @route DELETE /admin/users/{id}/sessions
   * @param id path parameter
   */
  deleteAdminUsersByIdSessions(id: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/admin/users/${encodeURIComponent(id)}/sessions`,
    );
  }

  /**
   * Revoke a specific session by ID (admin only)
   *
   * @route DELETE /admin/sessions/{id}
   * @param id path parameter
   */
  deleteAdminSessionsById(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/sessions/${encodeURIComponent(id)}`);
  }

  /**
   * List all roles (admin only)
   *
   * @route GET /admin/roles
   */
  getAdminRoles(): Promise<unknown> {
    return this.request("GET", `/admin/roles`);
  }

  /**
   * Create a new role (admin only)
   *
   * @route POST /admin/roles
   */
  postAdminRoles(body: {
    name: string;
    displayName: string;
    description?: string;
    parentRoleName?: string;
    permissions?: unknown[];
  }): Promise<unknown> {
    return this.request("POST", `/admin/roles`, { body });
  }

  /**
   * List JIT access grants (admin only)
   *
   * @route GET /admin/jit-grants
   */
  getAdminJitGrants(query?: {
    status?: "pending" | "approved" | "denied" | "expired" | "revoked";
  }): Promise<unknown> {
    return this.request("GET", `/admin/jit-grants`, { query });
  }

  /**
   * Approve a JIT grant request (admin only)
   *
   * @route POST /admin/jit-grants/{id}/approve
   * @param id path parameter
   */
  postAdminJitGrantsByIdApprove(id: string): Promise<unknown> {
    return this.request(
      "POST",
      `/admin/jit-grants/${encodeURIComponent(id)}/approve`,
    );
  }

  /**
   * Deny a JIT grant request (admin only)
   *
   * @route POST /admin/jit-grants/{id}/deny
   * @param id path parameter
   */
  postAdminJitGrantsByIdDeny(id: string): Promise<unknown> {
    return this.request(
      "POST",
      `/admin/jit-grants/${encodeURIComponent(id)}/deny`,
    );
  }

  /**
   * Revoke an approved JIT grant (admin only)
   *
   * @route DELETE /admin/jit-grants/{id}
   * @param id path parameter
   */
  deleteAdminJitGrantsById(id: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/admin/jit-grants/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Query audit log (admin only)
   *
   * @route GET /admin/audit-logs
   */
  getAdminAuditLogs(query?: {
    limit?: number;
    offset?: number;
    action?: string;
    actorId?: string;
  }): Promise<unknown> {
    return this.request("GET", `/admin/audit-logs`, { query });
  }

  /**
   * Receive a Security Event Token (SET) from a provider
   *
   * @route POST /ssf/events
   */
  postSsfEvents(body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/ssf/events`, { body });
  }

  /**
   * Health and dependency status
   *
   * @route GET /healthz
   */
  getHealthz(): Promise<{
    status?: "ok";
    redis?: string;
    elasticsearch?: string;
  }> {
    return this.request("GET", `/healthz`);
  }
}
