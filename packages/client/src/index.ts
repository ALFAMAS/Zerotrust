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
   * Get security.txt (/.well-known/security.txt)
   *
   * @route GET /.well-known/security.txt
   */
  getWellKnownSecurityTxt(): Promise<unknown> {
    return this.request("GET", `/.well-known/security.txt`);
  }

  /**
   * Get access-reviews (/admin/access-reviews)
   *
   * @route GET /admin/access-reviews
   */
  getAdminAccessReviews(): Promise<unknown> {
    return this.request("GET", `/admin/access-reviews`);
  }

  /**
   * Create access-reviews (/admin/access-reviews)
   *
   * @route POST /admin/access-reviews
   */
  postAdminAccessReviews(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/access-reviews`, { body });
  }

  /**
   * Get id (/admin/access-reviews/{id})
   *
   * @route GET /admin/access-reviews/{id}
   * @param id path parameter
   */
  getAdminAccessReviewsById(id: string): Promise<unknown> {
    return this.request("GET", `/admin/access-reviews/${encodeURIComponent(id)}`);
  }

  /**
   * Create complete (/admin/access-reviews/{id}/complete)
   *
   * @route POST /admin/access-reviews/{id}/complete
   * @param id path parameter
   */
  postAdminAccessReviewsByIdComplete(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/access-reviews/${encodeURIComponent(id)}/complete`, { body });
  }

  /**
   * Update itemId (/admin/access-reviews/{id}/items/{itemId})
   *
   * @route PATCH /admin/access-reviews/{id}/items/{itemId}
   * @param id path parameter
   * @param itemId path parameter
   */
  patchAdminAccessReviewsByIdItemsByItemId(id: string, itemId: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PATCH", `/admin/access-reviews/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { body });
  }

  /**
   * Get userId (/admin/anomaly/baseline/{userId})
   *
   * @route GET /admin/anomaly/baseline/{userId}
   * @param userId path parameter
   */
  getAdminAnomalyBaselineByUserId(userId: string): Promise<unknown> {
    return this.request("GET", `/admin/anomaly/baseline/${encodeURIComponent(userId)}`);
  }

  /**
   * Delete userId (/admin/anomaly/baseline/{userId})
   *
   * @route DELETE /admin/anomaly/baseline/{userId}
   * @param userId path parameter
   */
  deleteAdminAnomalyBaselineByUserId(userId: string): Promise<unknown> {
    return this.request("DELETE", `/admin/anomaly/baseline/${encodeURIComponent(userId)}`);
  }

  /**
   * Get baselines (/admin/anomaly/baselines)
   *
   * @route GET /admin/anomaly/baselines
   */
  getAdminAnomalyBaselines(): Promise<unknown> {
    return this.request("GET", `/admin/anomaly/baselines`);
  }

  /**
   * Create score (/admin/anomaly/score)
   *
   * @route POST /admin/anomaly/score
   */
  postAdminAnomalyScore(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/anomaly/score`, { body });
  }

  /**
   * Get attachments (/admin/attachments)
   *
   * @route GET /admin/attachments
   */
  getAdminAttachments(): Promise<unknown> {
    return this.request("GET", `/admin/attachments`);
  }

  /**
   * Create upload (/admin/attachments/upload)
   *
   * @route POST /admin/attachments/upload
   */
  postAdminAttachmentsUpload(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/attachments/upload`, { body });
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
   * Get verify (/admin/audit-logs/verify)
   *
   * @route GET /admin/audit-logs/verify
   */
  getAdminAuditLogsVerify(): Promise<unknown> {
    return this.request("GET", `/admin/audit-logs/verify`);
  }

  /**
   * Get export (/admin/audit/export)
   *
   * @route GET /admin/audit/export
   */
  getAdminAuditExport(): Promise<unknown> {
    return this.request("GET", `/admin/audit/export`);
  }

  /**
   * Create broadcast (/admin/broadcast)
   *
   * @route POST /admin/broadcast
   */
  postAdminBroadcast(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/broadcast`, { body });
  }

  /**
   * Get feedback (/admin/feedback)
   *
   * @route GET /admin/feedback
   */
  getAdminFeedback(): Promise<unknown> {
    return this.request("GET", `/admin/feedback`);
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
   * Revoke an approved JIT grant (admin only)
   *
   * @route DELETE /admin/jit-grants/{id}
   * @param id path parameter
   */
  deleteAdminJitGrantsById(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/jit-grants/${encodeURIComponent(id)}`);
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
   * Create lifecycle-emails (/admin/lifecycle-emails)
   *
   * @route POST /admin/lifecycle-emails
   */
  postAdminLifecycleEmails(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/lifecycle-emails`, { body });
  }

  /**
   * Get channels (/admin/notifications/channels)
   *
   * @route GET /admin/notifications/channels
   */
  getAdminNotificationsChannels(): Promise<unknown> {
    return this.request("GET", `/admin/notifications/channels`);
  }

  /**
   * Create channels (/admin/notifications/channels)
   *
   * @route POST /admin/notifications/channels
   */
  postAdminNotificationsChannels(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/notifications/channels`, { body });
  }

  /**
   * Update id (/admin/notifications/channels/{id})
   *
   * @route PATCH /admin/notifications/channels/{id}
   * @param id path parameter
   */
  patchAdminNotificationsChannelsById(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PATCH", `/admin/notifications/channels/${encodeURIComponent(id)}`, { body });
  }

  /**
   * Delete id (/admin/notifications/channels/{id})
   *
   * @route DELETE /admin/notifications/channels/{id}
   * @param id path parameter
   */
  deleteAdminNotificationsChannelsById(id: string): Promise<unknown> {
    return this.request("DELETE", `/admin/notifications/channels/${encodeURIComponent(id)}`);
  }

  /**
   * Create test (/admin/notifications/channels/{id}/test)
   *
   * @route POST /admin/notifications/channels/{id}/test
   * @param id path parameter
   */
  postAdminNotificationsChannelsByIdTest(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/notifications/channels/${encodeURIComponent(id)}/test`, { body });
  }

  /**
   * Get config (/admin/notifications/config)
   *
   * @route GET /admin/notifications/config
   */
  getAdminNotificationsConfig(): Promise<unknown> {
    return this.request("GET", `/admin/notifications/config`);
  }

  /**
   * Create test (/admin/notifications/test)
   *
   * @route POST /admin/notifications/test
   */
  postAdminNotificationsTest(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/notifications/test`, { body });
  }

  /**
   * Get revenue (/admin/revenue)
   *
   * @route GET /admin/revenue
   */
  getAdminRevenue(): Promise<unknown> {
    return this.request("GET", `/admin/revenue`);
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
   * Get sessions (/admin/sessions)
   *
   * @route GET /admin/sessions
   */
  getAdminSessions(): Promise<unknown> {
    return this.request("GET", `/admin/sessions`);
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
   * Get settings (/admin/settings)
   *
   * @route GET /admin/settings
   */
  getAdminSettings(): Promise<unknown> {
    return this.request("GET", `/admin/settings`);
  }

  /**
   * Update settings (/admin/settings)
   *
   * @route PUT /admin/settings
   */
  putAdminSettings(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PUT", `/admin/settings`, { body });
  }

  /**
   * Get slo (/admin/slo)
   *
   * @route GET /admin/slo
   */
  getAdminSlo(): Promise<unknown> {
    return this.request("GET", `/admin/slo`);
  }

  /**
   * Get stats (/admin/stats)
   *
   * @route GET /admin/stats
   */
  getAdminStats(): Promise<unknown> {
    return this.request("GET", `/admin/stats`);
  }

  /**
   * Create presigned (/admin/uploads/presigned)
   *
   * @route POST /admin/uploads/presigned
   */
  postAdminUploadsPresigned(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/uploads/presigned`, { body });
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
   * Create force-logout (/admin/users/{id}/force-logout)
   *
   * @route POST /admin/users/{id}/force-logout
   * @param id path parameter
   */
  postAdminUsersByIdForceLogout(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/users/${encodeURIComponent(id)}/force-logout`, { body });
  }

  /**
   * Create impersonate (/admin/users/{id}/impersonate)
   *
   * @route POST /admin/users/{id}/impersonate
   * @param id path parameter
   */
  postAdminUsersByIdImpersonate(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/users/${encodeURIComponent(id)}/impersonate`, { body });
  }

  /**
   * Create legal-hold (/admin/users/{id}/legal-hold)
   *
   * @route POST /admin/users/{id}/legal-hold
   * @param id path parameter
   */
  postAdminUsersByIdLegalHold(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/admin/users/${encodeURIComponent(id)}/legal-hold`, { body });
  }

  /**
   * Update plan (/admin/users/{id}/plan)
   *
   * @route PUT /admin/users/{id}/plan
   * @param id path parameter
   */
  putAdminUsersByIdPlan(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PUT", `/admin/users/${encodeURIComponent(id)}/plan`, { body });
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
   * Update segment (/admin/users/{id}/segment)
   *
   * @route PUT /admin/users/{id}/segment
   * @param id path parameter
   */
  putAdminUsersByIdSegment(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PUT", `/admin/users/${encodeURIComponent(id)}/segment`, { body });
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
   * Get export (/admin/users/export)
   *
   * @route GET /admin/users/export
   */
  getAdminUsersExport(): Promise<unknown> {
    return this.request("GET", `/admin/users/export`);
  }

  /**
   * Get segments (/admin/users/segments)
   *
   * @route GET /admin/users/segments
   */
  getAdminUsersSegments(): Promise<unknown> {
    return this.request("GET", `/admin/users/segments`);
  }

  /**
   * Get deliveries (/admin/webhooks/{webhookId}/deliveries)
   *
   * @route GET /admin/webhooks/{webhookId}/deliveries
   * @param webhookId path parameter
   */
  getAdminWebhooksByWebhookIdDeliveries(webhookId: string): Promise<unknown> {
    return this.request("GET", `/admin/webhooks/${encodeURIComponent(webhookId)}/deliveries`);
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

  /**
   * Get versions (/api/versions)
   *
   * @route GET /api/versions
   */
  getApiVersions(): Promise<unknown> {
    return this.request("GET", `/api/versions`);
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
   * Create mfa (/auth/login/mfa)
   *
   * @route POST /auth/login/mfa
   */
  postAuthLoginMfa(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/login/mfa`, { body });
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
   * Create send (/auth/magic-link/send)
   *
   * @route POST /auth/magic-link/send
   */
  postAuthMagicLinkSend(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/magic-link/send`, { body });
  }

  /**
   * Get verify (/auth/magic-link/verify)
   *
   * @route GET /auth/magic-link/verify
   */
  getAuthMagicLinkVerify(): Promise<unknown> {
    return this.request("GET", `/auth/magic-link/verify`);
  }

  /**
   * Create verify (/auth/magic-link/verify)
   *
   * @route POST /auth/magic-link/verify
   */
  postAuthMagicLinkVerify(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/magic-link/verify`, { body });
  }

  /**
   * Get me (/auth/me)
   *
   * @route GET /auth/me
   */
  getAuthMe(): Promise<unknown> {
    return this.request("GET", `/auth/me`);
  }

  /**
   * Update me (/auth/me)
   *
   * @route PATCH /auth/me
   */
  patchAuthMe(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PATCH", `/auth/me`, { body });
  }

  /**
   * Create avatar (/auth/me/avatar)
   *
   * @route POST /auth/me/avatar
   */
  postAuthMeAvatar(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/me/avatar`, { body });
  }

  /**
   * Create email (/auth/me/email)
   *
   * @route POST /auth/me/email
   */
  postAuthMeEmail(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/me/email`, { body });
  }

  /**
   * Create link (/auth/me/link)
   *
   * @route POST /auth/me/link
   */
  postAuthMeLink(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/me/link`, { body });
  }

  /**
   * Create nps (/auth/me/nps)
   *
   * @route POST /auth/me/nps
   */
  postAuthMeNps(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/me/nps`, { body });
  }

  /**
   * Get should-prompt (/auth/me/nps/should-prompt)
   *
   * @route GET /auth/me/nps/should-prompt
   */
  getAuthMeNpsShouldPrompt(): Promise<unknown> {
    return this.request("GET", `/auth/me/nps/should-prompt`);
  }

  /**
   * Create onboarding-complete (/auth/me/onboarding-complete)
   *
   * @route POST /auth/me/onboarding-complete
   */
  postAuthMeOnboardingComplete(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/me/onboarding-complete`, { body });
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
   * Regenerate backup codes (invalidates existing ones)
   *
   * @route POST /auth/mfa/backup-codes/regenerate
   */
  postAuthMfaBackupCodesRegenerate(body: { code: string }): Promise<{ backupCodes?: string[] }> {
    return this.request("POST", `/auth/mfa/backup-codes/regenerate`, { body });
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
   * Delete totp (/auth/mfa/totp)
   *
   * @route DELETE /auth/mfa/totp
   */
  deleteAuthMfaTotp(): Promise<unknown> {
    return this.request("DELETE", `/auth/mfa/totp`);
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
   * Delete provider (/auth/oauth/{provider})
   *
   * @route DELETE /auth/oauth/{provider}
   * @param provider path parameter
   */
  deleteAuthOauthByProvider(provider: string): Promise<unknown> {
    return this.request("DELETE", `/auth/oauth/${encodeURIComponent(provider)}`);
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
   * Generate an ephemeral OAuth state token (PKCE/nonce)
   *
   * @route POST /auth/oauth/state
   */
  postAuthOauthState(body?: { codeChallenge?: string; redirectUri?: string }): Promise<{ state?: string; nonce?: string; ttlSeconds?: number }> {
    return this.request("POST", `/auth/oauth/state`, { body });
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
   * Complete WebAuthn authentication
   *
   * @route POST /auth/passkey/authenticate
   */
  postAuthPasskeyAuthenticate(body: { body: Record<string, unknown>; challengeKey: string }): Promise<TokenResponse> {
    return this.request("POST", `/auth/passkey/authenticate`, { body });
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
   * Create verify (/auth/passkey/authenticate/verify)
   *
   * @route POST /auth/passkey/authenticate/verify
   */
  postAuthPasskeyAuthenticateVerify(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/passkey/authenticate/verify`, { body });
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
   * Get WebAuthn registration options
   *
   * @route POST /auth/passkey/register/options
   */
  postAuthPasskeyRegisterOptions(): Promise<unknown> {
    return this.request("POST", `/auth/passkey/register/options`);
  }

  /**
   * Create verify (/auth/passkey/register/verify)
   *
   * @route POST /auth/passkey/register/verify
   */
  postAuthPasskeyRegisterVerify(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/passkey/register/verify`, { body });
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
   * Request a password reset OTP
   *
   * @route POST /auth/password-reset/request
   */
  postAuthPasswordResetRequest(body: { email: string; channel?: "email" }): Promise<{ success?: boolean; message?: string }> {
    return this.request("POST", `/auth/password-reset/request`, { body });
  }

  /**
   * Get challenge (/auth/pow/challenge)
   *
   * @route GET /auth/pow/challenge
   */
  getAuthPowChallenge(): Promise<unknown> {
    return this.request("GET", `/auth/pow/challenge`);
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
   * Rotate refresh token and issue new access token
   *
   * @route POST /auth/token/refresh
   */
  postAuthTokenRefresh(body: { refreshToken: string }): Promise<TokenResponse> {
    return this.request("POST", `/auth/token/refresh`, { body });
  }

  /**
   * Email unsubscribe landing (API-only HTML)
   *
   * API/SDK-only. Verifies a signed token from email links and returns an HTML confirmation page (not JSON). No dashboard UI — email templates link directly to this API route.
   *
   * @route GET /auth/unsubscribe
   */
  getAuthUnsubscribe(query: { token: string }): Promise<unknown> {
    return this.request("GET", `/auth/unsubscribe`, { query });
  }

  /**
   * Create verify-email (/auth/verify-email)
   *
   * @route POST /auth/verify-email
   */
  postAuthVerifyEmail(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/verify-email`, { body });
  }

  /**
   * Create resend (/auth/verify-email/resend)
   *
   * @route POST /auth/verify-email/resend
   */
  postAuthVerifyEmailResend(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/verify-email/resend`, { body });
  }

  /**
   * Create challenge (/auth/verify/challenge)
   *
   * @route POST /auth/verify/challenge
   */
  postAuthVerifyChallenge(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/verify/challenge`, { body });
  }

  /**
   * Create respond (/auth/verify/respond)
   *
   * @route POST /auth/verify/respond
   */
  postAuthVerifyRespond(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/auth/verify/respond`, { body });
  }

  /**
   * Get status (/auth/verify/status)
   *
   * @route GET /auth/verify/status
   */
  getAuthVerifyStatus(): Promise<unknown> {
    return this.request("GET", `/auth/verify/status`);
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
   * Change subscription plan
   *
   * @route POST /billing/change-plan
   */
  postBillingChangePlan(body: { plan: string; priceId?: string }): Promise<GenericObject> {
    return this.request("POST", `/billing/change-plan`, { body });
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
   * List supported billing currencies
   *
   * @route GET /billing/currencies
   */
  getBillingCurrencies(): Promise<{ currencies?: GenericObject[] }> {
    return this.request("GET", `/billing/currencies`);
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
   * Get localized plan pricing
   *
   * @route GET /billing/pricing
   */
  getBillingPricing(query?: { currency?: string; locale?: string }): Promise<{ plans?: GenericObject[] }> {
    return this.request("GET", `/billing/pricing`, { query });
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
   * Get current subscription
   *
   * @route GET /billing/subscription
   */
  getBillingSubscription(): Promise<BillingSubscription> {
    return this.request("GET", `/billing/subscription`);
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
   * Quote sales tax / VAT
   *
   * @route POST /billing/tax/quote
   */
  postBillingTaxQuote(body: GenericObject): Promise<GenericObject> {
    return this.request("POST", `/billing/tax/quote`, { body });
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
   * Validate VAT number
   *
   * @route GET /billing/vat/validate
   */
  getBillingVatValidate(query: { vatNumber: string; country?: string }): Promise<GenericObject> {
    return this.request("GET", `/billing/vat/validate`, { query });
  }

  /**
   * Stripe billing webhook (signature-verified)
   *
   * @route POST /billing/webhook
   */
  postBillingWebhook(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/billing/webhook`, { body });
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
   * Get SOC 2 readiness summary
   *
   * @route GET /compliance/soc2/readiness
   */
  getComplianceSoc2Readiness(): Promise<GenericObject> {
    return this.request("GET", `/compliance/soc2/readiness`);
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
   * Export authenticated user data
   *
   * @route GET /gdpr/export
   */
  getGdprExport(): Promise<GenericObject> {
    return this.request("GET", `/gdpr/export`);
  }

  /**
   * Get health (/health)
   *
   * @route GET /health
   */
  getHealth(): Promise<unknown> {
    return this.request("GET", `/health`);
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
   * Get cross-tenant (/jit/cross-tenant)
   *
   * @route GET /jit/cross-tenant
   */
  getJitCrossTenant(): Promise<unknown> {
    return this.request("GET", `/jit/cross-tenant`);
  }

  /**
   * Create cross-tenant (/jit/cross-tenant)
   *
   * @route POST /jit/cross-tenant
   */
  postJitCrossTenant(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/jit/cross-tenant`, { body });
  }

  /**
   * Create approve (/jit/cross-tenant/{id}/approve)
   *
   * @route POST /jit/cross-tenant/{id}/approve
   * @param id path parameter
   */
  postJitCrossTenantByIdApprove(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/jit/cross-tenant/${encodeURIComponent(id)}/approve`, { body });
  }

  /**
   * Create deny (/jit/cross-tenant/{id}/deny)
   *
   * @route POST /jit/cross-tenant/{id}/deny
   * @param id path parameter
   */
  postJitCrossTenantByIdDeny(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/jit/cross-tenant/${encodeURIComponent(id)}/deny`, { body });
  }

  /**
   * Get incoming (/jit/cross-tenant/incoming)
   *
   * @route GET /jit/cross-tenant/incoming
   */
  getJitCrossTenantIncoming(): Promise<unknown> {
    return this.request("GET", `/jit/cross-tenant/incoming`);
  }

  /**
   * Get requestId (/jit/cross-tenant/status/{requestId})
   *
   * @route GET /jit/cross-tenant/status/{requestId}
   * @param requestId path parameter
   */
  getJitCrossTenantStatusByRequestId(requestId: string): Promise<unknown> {
    return this.request("GET", `/jit/cross-tenant/status/${encodeURIComponent(requestId)}`);
  }

  /**
   * Get metrics (/metrics)
   *
   * @route GET /metrics
   */
  getMetrics(): Promise<unknown> {
    return this.request("GET", `/metrics`);
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
   * Mark notification as read
   *
   * @route POST /notifications/{id}/read
   * @param id path parameter
   */
  postNotificationsByIdRead(id: string, body: Record<string, unknown>): Promise<SuccessResponse> {
    return this.request("POST", `/notifications/${encodeURIComponent(id)}/read`, { body });
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
   * Get unread notification count
   *
   * @route GET /notifications/unread-count
   */
  getNotificationsUnreadCount(): Promise<{ count?: number }> {
    return this.request("GET", `/notifications/unread-count`);
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
   * Transfer organization ownership
   *
   * @route POST /orgs/{orgId}/transfer
   * @param orgId path parameter
   */
  postOrgsByOrgIdTransfer(orgId: string, body: { newOwnerId: string }): Promise<unknown> {
    return this.request("POST", `/orgs/${encodeURIComponent(orgId)}/transfer`, { body });
  }

  /**
   * Decline (delete) one of the caller's own pending invites
   *
   * @route DELETE /orgs/invites/{inviteId}
   * @param inviteId path parameter
   */
  deleteOrgsInvitesByInviteId(inviteId: string): Promise<unknown> {
    return this.request("DELETE", `/orgs/invites/${encodeURIComponent(inviteId)}`);
  }

  /**
   * Accept a pending org invite by token
   *
   * @route POST /orgs/invites/accept
   */
  postOrgsInvitesAccept(body: { token: string }): Promise<unknown> {
    return this.request("POST", `/orgs/invites/accept`, { body });
  }

  /**
   * List the authenticated user's pending org invites
   *
   * @route GET /orgs/invites/mine
   */
  getOrgsInvitesMine(): Promise<unknown> {
    return this.request("GET", `/orgs/invites/mine`);
  }

  /**
   * Get protected (/protected)
   *
   * @route GET /protected
   */
  getProtected(): Promise<unknown> {
    return this.request("GET", `/protected`);
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
   * Get region health
   *
   * @route GET /regions/health
   */
  getRegionsHealth(): Promise<GenericObject> {
    return this.request("GET", `/regions/health`);
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
   * Resolve organization by custom domain
   *
   * @route GET /regions/resolve
   */
  getRegionsResolve(query?: { domain?: string }): Promise<GenericObject> {
    return this.request("GET", `/regions/resolve`, { query });
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
   * Ranked smart search
   *
   * @route GET /search/smart
   */
  getSearchSmart(query?: { q?: string; type?: string }): Promise<GenericObject> {
    return this.request("GET", `/search/smart`, { query });
  }

  /**
   * Get security.txt (/security.txt)
   *
   * @route GET /security.txt
   */
  getSecurityTxt(): Promise<unknown> {
    return this.request("GET", `/security.txt`);
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
   * Receive a Security Event Token (SET) from a provider
   *
   * @route POST /ssf/events
   */
  postSsfEvents(body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/ssf/events`, { body });
  }

  /**
   * Get status (/status)
   *
   * @route GET /status
   */
  getStatus(): Promise<unknown> {
    return this.request("GET", `/status`);
  }

  /**
   * Get stream (/status/stream)
   *
   * @route GET /status/stream
   */
  getStatusStream(): Promise<unknown> {
    return this.request("GET", `/status/stream`);
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
   * Get wallet balance
   *
   * @route GET /wallet
   */
  getWallet(): Promise<Wallet> {
    return this.request("GET", `/wallet`);
  }

  /**
   * Spend wallet balance (API/SDK-only)
   *
   * Programmatic wallet debit for integrations and background jobs. Not exposed in the dashboard UI — use the API or generated SDK from server-side code with a user or service token.
   *
   * @route POST /wallet/spend
   */
  postWalletSpend(body: { amount?: number; reason?: string; metadata?: GenericObject }): Promise<GenericObject> {
    return this.request("POST", `/wallet/spend`, { body });
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
   * List wallet transactions
   *
   * @route GET /wallet/transactions
   */
  getWalletTransactions(query?: { page?: number; limit?: number }): Promise<{ transactions?: GenericObject[]; meta?: PaginatedMeta }> {
    return this.request("GET", `/wallet/transactions`, { query });
  }

  /**
   * Get webhooks (/webhooks)
   *
   * @route GET /webhooks
   */
  getWebhooks(): Promise<unknown> {
    return this.request("GET", `/webhooks`);
  }

  /**
   * Create webhooks (/webhooks)
   *
   * @route POST /webhooks
   */
  postWebhooks(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/webhooks`, { body });
  }

  /**
   * Get id (/webhooks/{id})
   *
   * @route GET /webhooks/{id}
   * @param id path parameter
   */
  getWebhooksById(id: string): Promise<unknown> {
    return this.request("GET", `/webhooks/${encodeURIComponent(id)}`);
  }

  /**
   * Update id (/webhooks/{id})
   *
   * @route PATCH /webhooks/{id}
   * @param id path parameter
   */
  patchWebhooksById(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("PATCH", `/webhooks/${encodeURIComponent(id)}`, { body });
  }

  /**
   * Delete id (/webhooks/{id})
   *
   * @route DELETE /webhooks/{id}
   * @param id path parameter
   */
  deleteWebhooksById(id: string): Promise<unknown> {
    return this.request("DELETE", `/webhooks/${encodeURIComponent(id)}`);
  }

  /**
   * Get deliveries (/webhooks/{id}/deliveries)
   *
   * @route GET /webhooks/{id}/deliveries
   * @param id path parameter
   */
  getWebhooksByIdDeliveries(id: string): Promise<unknown> {
    return this.request("GET", `/webhooks/${encodeURIComponent(id)}/deliveries`);
  }

  /**
   * Create ping (/webhooks/{id}/ping)
   *
   * @route POST /webhooks/{id}/ping
   * @param id path parameter
   */
  postWebhooksByIdPing(id: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/webhooks/${encodeURIComponent(id)}/ping`, { body });
  }

  /**
   * Inbound email provider event webhook
   *
   * @route POST /webhooks/email/event
   */
  postWebhooksEmailEvent(body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `/webhooks/email/event`, { body });
  }
}
