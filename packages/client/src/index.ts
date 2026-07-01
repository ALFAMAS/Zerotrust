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

export type GenericObject = Record<string, unknown>;

export interface SuccessResponse {
  success?: boolean;
}

export interface PaginatedMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface MoneyAmount {
  amount?: number;
  currency?: string;
  formatted?: string;
}

export interface BillingSubscription {
  plan?: string;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
}

export interface Wallet {
  balance?: number;
  currency?: string;
  credits?: number;
}

export interface ApiKey {
  id?: string;
  name?: string;
  prefix?: string;
  scopes?: string[];
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface Notification {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  readAt?: string | null;
  createdAt?: string;
}

export interface SupportTicket {
  id?: string;
  subject?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
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
  constructor(message: string, status: number, code?: string, details?: unknown) {
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
    this.baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.token = options.token;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error("No fetch implementation available; pass options.fetch");
    this.fetchImpl = f.bind(globalThis);
    this.defaultHeaders = options.headers ?? {};
  }

  /** Update the bearer token used for subsequent requests. */
  setToken(token: string | undefined): void {
    this.token = token;
  }

  /** Low-level request helper used by every generated method. */
  async request<T>(method: string, path: string, options: zerotrustRequestOptions = {}): Promise<T> {
    let url = this.baseUrl + path;
    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) sp.append(k, String(v));
      }
      const qs = sp.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = { ...this.defaultHeaders, ...options.headers };
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
      const env = parsed as { code?: string; message?: string; error?: string; details?: unknown } | undefined;
      throw new zerotrustError(
        env?.message ?? env?.error ?? `Request failed with status ${res.status}`,
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
  postAuthRegister(body: { email: string; password: string; displayName?: string }): Promise<{ success?: boolean; userId?: string }> {
    return this.request("POST", `/auth/register`, { body });
  }

  /**
   * Login with email and password
   *
   * @route POST /auth/login
   */
  postAuthLogin(body: { email: string; password: string }): Promise<TokenResponse> {
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
  postAuthOauthState(body?: { codeChallenge?: string; redirectUri?: string }): Promise<{ state?: string; nonce?: string; ttlSeconds?: number }> {
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
  getAuthOauthByProviderAuthorize(provider: "google" | "github" | "facebook"): Promise<{ authorizeUrl?: string; state?: string }> {
    return this.request("GET", `/auth/oauth/${encodeURIComponent(provider)}/authorize`);
  }

  /**
   * OAuth authorization code callback
   *
   * Provider redirects here with an authorization code. On success the server creates a session, stores the tokens under a one-time exchange code, and 302-redirects to the frontend at /login?oauth_code=<code>. The SPA redeems it via POST /auth/oauth/exchange.
   *
   * @route GET /auth/oauth/{provider}/callback
   * @param provider path parameter
   */
  getAuthOauthByProviderCallback(provider: "google" | "github" | "facebook", query: { code: string; state: string }): Promise<unknown> {
    return this.request("GET", `/auth/oauth/${encodeURIComponent(provider)}/callback`, { query });
  }

  /**
   * Redeem a one-time OAuth exchange code for tokens
   *
   * Exchanges the single-use code delivered to /login?oauth_code=<code> for the access and refresh tokens. Keeps tokens out of the URL/history.
   *
   * @route POST /auth/oauth/exchange
   */
  postAuthOauthExchange(body: { code: string }): Promise<{ accessToken?: string; refreshToken?: string }> {
    return this.request("POST", `/auth/oauth/exchange`, { body });
  }

  /**
   * Request a password reset OTP
   *
   * @route POST /auth/password-reset/request
   */
  postAuthPasswordResetRequest(body: { email: string; channel?: "email" }): Promise<{ success?: boolean; message?: string }> {
    return this.request("POST", `/auth/password-reset/request`, { body });
  }

  /**
   * Confirm password reset with OTP
   *
   * @route POST /auth/password-reset/confirm
   */
  postAuthPasswordResetConfirm(body: { email: string; code: string; newPassword: string }): Promise<{ success?: boolean }> {
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
  postAuthPasskeyRegister(body: { body: Record<string, unknown>; name?: string }): Promise<{ success?: boolean; credentialId?: string }> {
    return this.request("POST", `/auth/passkey/register`, { body });
  }

  /**
   * Get WebAuthn authentication options
   *
   * @route POST /auth/passkey/authenticate/options
   */
  postAuthPasskeyAuthenticateOptions(body?: { email?: string }): Promise<unknown> {
    return this.request("POST", `/auth/passkey/authenticate/options`, { body });
  }

  /**
   * Complete WebAuthn authentication
   *
   * @route POST /auth/passkey/authenticate
   */
  postAuthPasskeyAuthenticate(body: { body: Record<string, unknown>; challengeKey: string }): Promise<TokenResponse> {
    return this.request("POST", `/auth/passkey/authenticate`, { body });
  }

  /**
   * Remove a registered passkey
   *
   * @route DELETE /auth/passkey/{credentialId}
   * @param credentialId path parameter
   */
  deleteAuthPasskeyByCredentialId(credentialId: string): Promise<unknown> {
    return this.request("DELETE", `/auth/passkey/${encodeURIComponent(credentialId)}`);
  }

  /**
   * Initialize TOTP setup — returns secret and QR code
   *
   * @route POST /auth/mfa/totp/setup
   */
  postAuthMfaTotpSetup(): Promise<{ secret?: string; otpAuthUrl?: string; qrDataUrl?: string }> {
    return this.request("POST", `/auth/mfa/totp/setup`);
  }

  /**
   * Verify TOTP code and activate TOTP MFA
   *
   * @route POST /auth/mfa/totp/verify
   */
  postAuthMfaTotpVerify(body: { code: string }): Promise<{ success?: boolean; backupCodes?: string[] }> {
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
  postAuthMfaBackupCodesRegenerate(body: { code: string }): Promise<{ backupCodes?: string[] }> {
    return this.request("POST", `/auth/mfa/backup-codes/regenerate`, { body });
  }

  /**
   * Redeem a backup code for authentication
   *
   * @route POST /auth/mfa/backup-codes/redeem
   */
  postAuthMfaBackupCodesRedeem(body: { code: string }): Promise<{ success?: boolean; remainingCodes?: number }> {
    return this.request("POST", `/auth/mfa/backup-codes/redeem`, { body });
  }

  /**
   * Send Email OTP
   *
   * @route POST /auth/mfa/otp/send
   */
  postAuthMfaOtpSend(body: { channel: "email"; target: string }): Promise<{ success?: boolean; expiresIn?: number }> {
    return this.request("POST", `/auth/mfa/otp/send`, { body });
  }

  /**
   * Verify channel OTP
   *
   * @route POST /auth/mfa/otp/verify
   */
  postAuthMfaOtpVerify(body: { code: string; channel: "email" }): Promise<unknown> {
    return this.request("POST", `/auth/mfa/otp/verify`, { body });
  }

  /**
   * List active sessions for authenticated user
   *
   * @route GET /sessions
   */
  getSessions(query?: { limit?: number; offset?: number; activeOnly?: boolean }): Promise<{ sessions?: Session[]; total?: number; limit?: number; offset?: number }> {
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
   * List all users (admin only)
   *
   * @route GET /admin/users
   */
  getAdminUsers(query?: { limit?: number; offset?: number; search?: string }): Promise<unknown> {
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
  patchAdminUsersById(id: string, body?: { status?: "active" | "suspended" | "deleted"; roles?: string[]; displayName?: string }): Promise<unknown> {
    return this.request("PATCH", `/admin/users/${encodeURIComponent(id)}`, { body });
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
  postAdminUsersByIdRoles(id: string, body: { roleName: string }): Promise<unknown> {
    return this.request("POST", `/admin/users/${encodeURIComponent(id)}/roles`, { body });
  }

  /**
   * Remove role from user (admin only)
   *
   * @route DELETE /admin/users/{id}/roles/{roleName}
   * @param id path parameter
   * @param roleName path parameter
   */
  deleteAdminUsersByIdRolesByRoleName(id: string, roleName: string): Promise<unknown> {
    return this.request("DELETE", `/admin/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleName)}`);
  }

  /**
   * List all sessions for a user (admin only)
   *
   * @route GET /admin/users/{id}/sessions
   * @param id path parameter
   */
  getAdminUsersByIdSessions(id: string): Promise<unknown> {
    return this.request("GET", `/admin/users/${encodeURIComponent(id)}/sessions`);
  }

  /**
   * Revoke all sessions for a user (admin only)
   *
   * @route DELETE /admin/users/{id}/sessions
   * @param id path parameter
   */
  deleteAdminUsersByIdSessions(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/users/${encodeURIComponent(id)}/sessions`);
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
  postAdminRoles(body: { name: string; displayName: string; description?: string; parentRoleName?: string; permissions?: unknown[] }): Promise<unknown> {
    return this.request("POST", `/admin/roles`, { body });
  }

  /**
   * List JIT access grants (admin only)
   *
   * @route GET /admin/jit-grants
   */
  getAdminJitGrants(query?: { status?: "pending" | "approved" | "denied" | "expired" | "revoked" }): Promise<unknown> {
    return this.request("GET", `/admin/jit-grants`, { query });
  }

  /**
   * Approve a JIT grant request (admin only)
   *
   * @route POST /admin/jit-grants/{id}/approve
   * @param id path parameter
   */
  postAdminJitGrantsByIdApprove(id: string): Promise<unknown> {
    return this.request("POST", `/admin/jit-grants/${encodeURIComponent(id)}/approve`);
  }

  /**
   * Deny a JIT grant request (admin only)
   *
   * @route POST /admin/jit-grants/{id}/deny
   * @param id path parameter
   */
  postAdminJitGrantsByIdDeny(id: string): Promise<unknown> {
    return this.request("POST", `/admin/jit-grants/${encodeURIComponent(id)}/deny`);
  }

  /**
   * Revoke an approved JIT grant (admin only)
   *
   * @route DELETE /admin/jit-grants/{id}
   * @param id path parameter
   */
  deleteAdminJitGrantsById(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/jit-grants/${encodeURIComponent(id)}`);
  }

  /**
   * Query audit log (admin only)
   *
   * @route GET /admin/audit-logs
   */
  getAdminAuditLogs(query?: { limit?: number; offset?: number; action?: string; actorId?: string }): Promise<unknown> {
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
  getHealthz(): Promise<{ status?: "ok"; redis?: string; elasticsearch?: string }> {
    return this.request("GET", `/healthz`);
  }

  /**
   * List organizations the current user belongs to
   *
   * @route GET /orgs
   */
  getOrgs(): Promise<unknown> {
    return this.request("GET", `/orgs`);
  }

  /**
   * Create an organization (creator becomes owner)
   *
   * @route POST /orgs
   */
  postOrgs(body: { name: string; slug?: string }): Promise<unknown> {
    return this.request("POST", `/orgs`, { body });
  }

  /**
   * Get an organization
   *
   * @route GET /orgs/{orgId}
   * @param orgId path parameter
   */
  getOrgsByOrgId(orgId: string): Promise<unknown> {
    return this.request("GET", `/orgs/${encodeURIComponent(orgId)}`);
  }

  /**
   * Update organization settings
   *
   * @route PUT /orgs/{orgId}
   * @param orgId path parameter
   */
  putOrgsByOrgId(orgId: string, body: { name?: string; slug?: string; logoUrl?: string; billingEmail?: string }): Promise<unknown> {
    return this.request("PUT", `/orgs/${encodeURIComponent(orgId)}`, { body });
  }

  /**
   * Delete an organization
   *
   * @route DELETE /orgs/{orgId}
   * @param orgId path parameter
   */
  deleteOrgsByOrgId(orgId: string): Promise<unknown> {
    return this.request("DELETE", `/orgs/${encodeURIComponent(orgId)}`);
  }

  /**
   * List organization members
   *
   * @route GET /orgs/{orgId}/members
   * @param orgId path parameter
   */
  getOrgsByOrgIdMembers(orgId: string): Promise<unknown> {
    return this.request("GET", `/orgs/${encodeURIComponent(orgId)}/members`);
  }

  /**
   * Remove a member (cannot remove the last owner)
   *
   * @route DELETE /orgs/{orgId}/members/{userId}
   * @param orgId path parameter
   * @param userId path parameter
   */
  deleteOrgsByOrgIdMembersByUserId(orgId: string, userId: string): Promise<unknown> {
    return this.request("DELETE", `/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`);
  }

  /**
   * Transfer organization ownership
   *
   * @route POST /orgs/{orgId}/transfer
   * @param orgId path parameter
   */
  postOrgsByOrgIdTransfer(orgId: string, body: { newOwnerId: string }): Promise<unknown> {
    return this.request("POST", `/orgs/${encodeURIComponent(orgId)}/transfer`, { body });
  }

  /**
   * List pending invites
   *
   * @route GET /orgs/{orgId}/invites
   * @param orgId path parameter
   */
  getOrgsByOrgIdInvites(orgId: string): Promise<unknown> {
    return this.request("GET", `/orgs/${encodeURIComponent(orgId)}/invites`);
  }

  /**
   * Invite a user by email
   *
   * @route POST /orgs/{orgId}/invites
   * @param orgId path parameter
   */
  postOrgsByOrgIdInvites(orgId: string, body: { email: string; role?: string }): Promise<unknown> {
    return this.request("POST", `/orgs/${encodeURIComponent(orgId)}/invites`, { body });
  }

  /**
   * Revoke a pending invite
   *
   * @route DELETE /orgs/{orgId}/invites/{inviteId}
   * @param orgId path parameter
   * @param inviteId path parameter
   */
  deleteOrgsByOrgIdInvitesByInviteId(orgId: string, inviteId: string): Promise<unknown> {
    return this.request("DELETE", `/orgs/${encodeURIComponent(orgId)}/invites/${encodeURIComponent(inviteId)}`);
  }

  /**
   * Get the org security policy (session/device/geo limits)
   *
   * @route GET /orgs/{orgId}/security/policy
   * @param orgId path parameter
   */
  getOrgsByOrgIdSecurityPolicy(orgId: string): Promise<unknown> {
    return this.request("GET", `/orgs/${encodeURIComponent(orgId)}/security/policy`);
  }

  /**
   * Update the org security policy
   *
   * @route PUT /orgs/{orgId}/security/policy
   * @param orgId path parameter
   */
  putOrgsByOrgIdSecurityPolicy(orgId: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("PUT", `/orgs/${encodeURIComponent(orgId)}/security/policy`, { body });
  }

  /**
   * Get current subscription
   *
   * @route GET /billing/subscription
   */
  getBillingSubscription(): Promise<BillingSubscription> {
    return this.request("GET", `/billing/subscription`);
  }

  /**
   * Get current billing usage
   *
   * @route GET /billing/usage
   */
  getBillingUsage(): Promise<GenericObject> {
    return this.request("GET", `/billing/usage`);
  }

  /**
   * Create Stripe checkout session
   *
   * @route POST /billing/checkout
   */
  postBillingCheckout(body: { priceId?: string; plan?: string }): Promise<{ url?: string }> {
    return this.request("POST", `/billing/checkout`, { body });
  }

  /**
   * Change subscription plan
   *
   * @route POST /billing/change-plan
   */
  postBillingChangePlan(body: { plan: string; priceId?: string }): Promise<GenericObject> {
    return this.request("POST", `/billing/change-plan`, { body });
  }

  /**
   * Cancel or pause subscription
   *
   * @route POST /billing/cancel
   */
  postBillingCancel(body: { action?: "cancel" | "pause"; reason?: string; comment?: string }): Promise<GenericObject> {
    return this.request("POST", `/billing/cancel`, { body });
  }

  /**
   * Reactivate subscription
   *
   * @route POST /billing/reactivate
   */
  postBillingReactivate(body: Record<string, unknown>): Promise<GenericObject> {
    return this.request("POST", `/billing/reactivate`, { body });
  }

  /**
   * Create Stripe billing portal session
   *
   * @route POST /billing/portal
   */
  postBillingPortal(body: Record<string, unknown>): Promise<{ url?: string }> {
    return this.request("POST", `/billing/portal`, { body });
  }

  /**
   * List supported billing currencies
   *
   * @route GET /billing/currencies
   */
  getBillingCurrencies(): Promise<{ currencies?: GenericObject[] }> {
    return this.request("GET", `/billing/currencies`);
  }

  /**
   * Get localized plan pricing
   *
   * @route GET /billing/pricing
   */
  getBillingPricing(query?: { currency?: string; locale?: string }): Promise<{ plans?: GenericObject[] }> {
    return this.request("GET", `/billing/pricing`, { query });
  }

  /**
   * Quote sales tax / VAT
   *
   * @route POST /billing/tax/quote
   */
  postBillingTaxQuote(body: GenericObject): Promise<GenericObject> {
    return this.request("POST", `/billing/tax/quote`, { body });
  }

  /**
   * Validate VAT number
   *
   * @route GET /billing/vat/validate
   */
  getBillingVatValidate(query: { vatNumber: string; country?: string }): Promise<GenericObject> {
    return this.request("GET", `/billing/vat/validate`, { query });
  }

  /**
   * List tax exemptions
   *
   * @route GET /billing/tax-exemptions
   */
  getBillingTaxExemptions(): Promise<GenericObject> {
    return this.request("GET", `/billing/tax-exemptions`);
  }

  /**
   * Create tax exemption request
   *
   * @route POST /billing/tax-exemptions
   */
  postBillingTaxExemptions(body: GenericObject): Promise<GenericObject> {
    return this.request("POST", `/billing/tax-exemptions`, { body });
  }

  /**
   * Update tax exemption status
   *
   * @route POST /billing/tax-exemptions/{id}/status
   * @param id path parameter
   */
  postBillingTaxExemptionsByIdStatus(id: string, body: { status?: string }): Promise<GenericObject> {
    return this.request("POST", `/billing/tax-exemptions/${encodeURIComponent(id)}/status`, { body });
  }

  /**
   * Get wallet balance
   *
   * @route GET /wallet
   */
  getWallet(): Promise<Wallet> {
    return this.request("GET", `/wallet`);
  }

  /**
   * List wallet transactions
   *
   * @route GET /wallet/transactions
   */
  getWalletTransactions(query?: { page?: number; limit?: number }): Promise<{ transactions?: GenericObject[]; meta?: PaginatedMeta }> {
    return this.request("GET", `/wallet/transactions`, { query });
  }

  /**
   * Top up wallet
   *
   * @route POST /wallet/top-up
   */
  postWalletTopUp(body: { amount?: number; currency?: string }): Promise<GenericObject> {
    return this.request("POST", `/wallet/top-up`, { body });
  }

  /**
   * Spend wallet balance
   *
   * @route POST /wallet/spend
   */
  postWalletSpend(body: { amount?: number; reason?: string; metadata?: GenericObject }): Promise<GenericObject> {
    return this.request("POST", `/wallet/spend`, { body });
  }

  /**
   * Search indexed resources
   *
   * @route GET /search
   */
  getSearch(query?: { q?: string; type?: string; page?: number; limit?: number }): Promise<GenericObject> {
    return this.request("GET", `/search`, { query });
  }

  /**
   * Smart / semantic search
   *
   * @route GET /search/smart
   */
  getSearchSmart(query?: { q?: string; type?: string }): Promise<GenericObject> {
    return this.request("GET", `/search/smart`, { query });
  }

  /**
   * Index a searchable document
   *
   * @route POST /search/index
   */
  postSearchIndex(body: GenericObject): Promise<SuccessResponse> {
    return this.request("POST", `/search/index`, { body });
  }

  /**
   * Remove an indexed document
   *
   * @route DELETE /search/index/{type}/{id}
   * @param type path parameter
   * @param id path parameter
   */
  deleteSearchIndexByTypeById(type: string, id: string): Promise<SuccessResponse> {
    return this.request("DELETE", `/search/index/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
  }

  /**
   * Get search provider status
   *
   * @route GET /search/provider
   */
  getSearchProvider(): Promise<GenericObject> {
    return this.request("GET", `/search/provider`);
  }

  /**
   * Get SOC 2 readiness summary
   *
   * @route GET /compliance/soc2/readiness
   */
  getComplianceSoc2Readiness(): Promise<GenericObject> {
    return this.request("GET", `/compliance/soc2/readiness`);
  }

  /**
   * List SOC 2 controls
   *
   * @route GET /compliance/soc2/controls
   */
  getComplianceSoc2Controls(): Promise<GenericObject> {
    return this.request("GET", `/compliance/soc2/controls`);
  }

  /**
   * Update SOC 2 control status
   *
   * @route PUT /compliance/soc2/controls/{controlId}
   * @param controlId path parameter
   */
  putComplianceSoc2ControlsByControlId(controlId: string, body: GenericObject): Promise<GenericObject> {
    return this.request("PUT", `/compliance/soc2/controls/${encodeURIComponent(controlId)}`, { body });
  }

  /**
   * Get annual risk assessment
   *
   * @route GET /compliance/risk-assessment/{year}
   * @param year path parameter
   */
  getComplianceRiskAssessmentByYear(year: string): Promise<GenericObject> {
    return this.request("GET", `/compliance/risk-assessment/${encodeURIComponent(year)}`);
  }

  /**
   * Create risk assessment item
   *
   * @route POST /compliance/risk-assessment/{year}
   * @param year path parameter
   */
  postComplianceRiskAssessmentByYear(year: string, body: GenericObject): Promise<GenericObject> {
    return this.request("POST", `/compliance/risk-assessment/${encodeURIComponent(year)}`, { body });
  }

  /**
   * Update risk assessment item
   *
   * @route PUT /compliance/risk-assessment/{year}/{riskId}
   * @param year path parameter
   * @param riskId path parameter
   */
  putComplianceRiskAssessmentByYearByRiskId(year: string, riskId: string, body: GenericObject): Promise<GenericObject> {
    return this.request("PUT", `/compliance/risk-assessment/${encodeURIComponent(year)}/${encodeURIComponent(riskId)}`, { body });
  }

  /**
   * List support tickets
   *
   * @route GET /support
   */
  getSupport(): Promise<{ tickets?: SupportTicket[] }> {
    return this.request("GET", `/support`);
  }

  /**
   * Create support ticket
   *
   * @route POST /support
   */
  postSupport(body: { subject: string; message: string; priority?: string }): Promise<SupportTicket> {
    return this.request("POST", `/support`, { body });
  }

  /**
   * Get support ticket
   *
   * @route GET /support/{id}
   * @param id path parameter
   */
  getSupportById(id: string): Promise<SupportTicket> {
    return this.request("GET", `/support/${encodeURIComponent(id)}`);
  }

  /**
   * Update support ticket
   *
   * @route PATCH /support/{id}
   * @param id path parameter
   */
  patchSupportById(id: string, body: GenericObject): Promise<SupportTicket> {
    return this.request("PATCH", `/support/${encodeURIComponent(id)}`, { body });
  }

  /**
   * Add support ticket message
   *
   * @route POST /support/{id}/messages
   * @param id path parameter
   */
  postSupportByIdMessages(id: string, body: { message: string }): Promise<GenericObject> {
    return this.request("POST", `/support/${encodeURIComponent(id)}/messages`, { body });
  }

  /**
   * Submit product feedback
   *
   * @route POST /feedback
   */
  postFeedback(body: { type: "nps" | "csat" | "thumbs"; score: number; comment?: string; context?: string; orgId?: string; metadata?: GenericObject }): Promise<GenericObject> {
    return this.request("POST", `/feedback`, { body });
  }

  /**
   * Export authenticated user data
   *
   * @route GET /gdpr/export
   */
  getGdprExport(): Promise<GenericObject> {
    return this.request("GET", `/gdpr/export`);
  }

  /**
   * Request account deletion
   *
   * @route DELETE /gdpr/account
   */
  deleteGdprAccount(body?: { password?: string; reason?: string }): Promise<GenericObject> {
    return this.request("DELETE", `/gdpr/account`, { body });
  }

  /**
   * Cancel pending account deletion
   *
   * @route POST /gdpr/account/deletion/cancel
   */
  postGdprAccountDeletionCancel(body: Record<string, unknown>): Promise<SuccessResponse> {
    return this.request("POST", `/gdpr/account/deletion/cancel`, { body });
  }

  /**
   * List notifications
   *
   * @route GET /notifications
   */
  getNotifications(query?: { page?: number; limit?: number }): Promise<{ notifications?: Notification[] }> {
    return this.request("GET", `/notifications`, { query });
  }

  /**
   * Get unread notification count
   *
   * @route GET /notifications/unread-count
   */
  getNotificationsUnreadCount(): Promise<{ count?: number }> {
    return this.request("GET", `/notifications/unread-count`);
  }

  /**
   * Mark notification as read
   *
   * @route POST /notifications/{id}/read
   * @param id path parameter
   */
  postNotificationsByIdRead(id: string, body: Record<string, unknown>): Promise<SuccessResponse> {
    return this.request("POST", `/notifications/${encodeURIComponent(id)}/read`, { body });
  }

  /**
   * Mark all notifications as read
   *
   * @route POST /notifications/read-all
   */
  postNotificationsReadAll(body: Record<string, unknown>): Promise<SuccessResponse> {
    return this.request("POST", `/notifications/read-all`, { body });
  }

  /**
   * Open notification SSE stream
   *
   * @route GET /notifications/sse
   */
  getNotificationsSse(): Promise<unknown> {
    return this.request("GET", `/notifications/sse`);
  }

  /**
   * Get notification preferences
   *
   * @route GET /notifications/preferences
   */
  getNotificationsPreferences(): Promise<GenericObject> {
    return this.request("GET", `/notifications/preferences`);
  }

  /**
   * Update notification preferences
   *
   * @route PUT /notifications/preferences
   */
  putNotificationsPreferences(body: GenericObject): Promise<GenericObject> {
    return this.request("PUT", `/notifications/preferences`, { body });
  }

  /**
   * Get web-push public key
   *
   * @route GET /notifications/push/public-key
   */
  getNotificationsPushPublicKey(): Promise<{ publicKey?: string }> {
    return this.request("GET", `/notifications/push/public-key`);
  }

  /**
   * Subscribe to web-push notifications
   *
   * @route POST /notifications/push/subscribe
   */
  postNotificationsPushSubscribe(body: GenericObject): Promise<SuccessResponse> {
    return this.request("POST", `/notifications/push/subscribe`, { body });
  }

  /**
   * Unsubscribe from web-push notifications
   *
   * @route POST /notifications/push/unsubscribe
   */
  postNotificationsPushUnsubscribe(body: GenericObject): Promise<SuccessResponse> {
    return this.request("POST", `/notifications/push/unsubscribe`, { body });
  }

  /**
   * Resolve organization by custom domain
   *
   * @route GET /regions/resolve
   */
  getRegionsResolve(query?: { domain?: string }): Promise<GenericObject> {
    return this.request("GET", `/regions/resolve`, { query });
  }

  /**
   * Get region health
   *
   * @route GET /regions/health
   */
  getRegionsHealth(): Promise<GenericObject> {
    return this.request("GET", `/regions/health`);
  }

  /**
   * Resolve storage region for country
   *
   * @route GET /regions/for-country
   */
  getRegionsForCountry(query?: { country?: string }): Promise<{ country?: string | null; region?: string }> {
    return this.request("GET", `/regions/for-country`, { query });
  }

  /**
   * Get organization branding
   *
   * @route GET /regions/orgs/{orgId}/branding
   * @param orgId path parameter
   */
  getRegionsOrgsByOrgIdBranding(orgId: string): Promise<GenericObject> {
    return this.request("GET", `/regions/orgs/${encodeURIComponent(orgId)}/branding`);
  }

  /**
   * Update organization branding
   *
   * @route PUT /regions/orgs/{orgId}/branding
   * @param orgId path parameter
   */
  putRegionsOrgsByOrgIdBranding(orgId: string, body: GenericObject): Promise<SuccessResponse> {
    return this.request("PUT", `/regions/orgs/${encodeURIComponent(orgId)}/branding`, { body });
  }

  /**
   * Set organization custom domain
   *
   * @route PUT /regions/orgs/{orgId}/domain
   * @param orgId path parameter
   */
  putRegionsOrgsByOrgIdDomain(orgId: string, body: { domain?: string | null }): Promise<SuccessResponse> {
    return this.request("PUT", `/regions/orgs/${encodeURIComponent(orgId)}/domain`, { body });
  }

  /**
   * Set organization data residency region
   *
   * @route PUT /regions/orgs/{orgId}/region
   * @param orgId path parameter
   */
  putRegionsOrgsByOrgIdRegion(orgId: string, body: { region: "us" | "eu" | "apac" }): Promise<{ success?: boolean; region?: string }> {
    return this.request("PUT", `/regions/orgs/${encodeURIComponent(orgId)}/region`, { body });
  }

  /**
   * List API keys
   *
   * @route GET /api-keys
   */
  getApiKeys(): Promise<{ apiKeys?: ApiKey[] }> {
    return this.request("GET", `/api-keys`);
  }

  /**
   * Create API key
   *
   * @route POST /api-keys
   */
  postApiKeys(body: { name: string; scopes?: string[]; expiresAt?: string }): Promise<{ apiKey?: ApiKey; secret?: string }> {
    return this.request("POST", `/api-keys`, { body });
  }

  /**
   * Revoke API key
   *
   * @route DELETE /api-keys/{id}
   * @param id path parameter
   */
  deleteApiKeysById(id: string): Promise<SuccessResponse> {
    return this.request("DELETE", `/api-keys/${encodeURIComponent(id)}`);
  }
}
