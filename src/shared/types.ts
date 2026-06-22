// ─── Configuration Types ─────────────────────────────────────────────────────

export interface ZeroAuthConfig {
  database: {
    databaseUrl: string;
    databaseUrlReadReplica?: string;
    connectionPoolSize: number;
    readReplicaPoolSize: number;
  };
  session: {
    defaultTTL: number;
    refreshTokenTTL: number;
    maxConcurrentDevices: number;
  };
  security: {
    bcryptRounds: number;
    tokenSecretHex: string;
    csfleMasterKeyHex: string;
    csflekeyRotationIntervalDays: number;
  };
  oauth: {
    providers: {
      [key: string]: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
      };
    };
  };
  mfa: {
    totpWindow: number;
    otpExpirySecs: number;
    maxOTPAttempts: number;
    channels: {
      email: { enabled: boolean };
      sms: { enabled: boolean; provider: string };
      whatsapp: { enabled: boolean; provider: string };
      telegram: { enabled: boolean; botToken: string };
    };
  };
  rateLimiting: {
    enabled: boolean;
    redisUri?: string;
    perIpLimit: number;
    windowSecs: number;
  };
  geofencing: {
    enabled: boolean;
    allowedCountries: string[];
    allowedIpRanges: string[];
  };
  elasticsearch: {
    enabled: boolean;
    host: string;
    port: number;
    indexPrefix: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "text";
  };
}

// ─── Authentication & Token Types ──────────────────────────────────────────

export interface TokenPayload {
  sub: string;
  email: string;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  aud?: string;
  iss?: string;
  scope?: string[];
  pop_key?: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: "Bearer";
}

// ─── User Types ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username?: string | null;
  passwordHash?: string | null;
  phone?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  roles: string[];
  attributes: {
    country?: string;
    timezone?: string;
    department?: string;
    employeeId?: string;
    clearanceLevel?: number;
    customAttributes?: Record<string, unknown>;
  };
  mfa: {
    totp: {
      enabled: boolean;
      secret?: string;
      backupCodes: string[];
      verifiedAt?: Date;
    };
    webauthn: {
      enabled: boolean;
    };
  };
  passkeys: Passkey[];
  oauthProviders: OAuthProvider[];
  status: "active" | "suspended" | "pending" | "deleted";
  parentUserId?: string | null;
  subUserIds: string[];
  sessionConfig: {
    maxDevices: number;
    allowedCountries: string[];
    allowedIpRanges: string[];
    scheduleRestriction: {
      enabled: boolean;
      timezone: string;
      allowedDays: number[];
      allowedHoursStart: number;
      allowedHoursEnd: number;
    };
  };
  lastLoginAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Passkey {
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType?: string;
  backedUp: boolean;
  transports: string[];
  name?: string;
  orgId?: string;
  aaguid?: string;
  attestationFormat?: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface OAuthProvider {
  provider: "google" | "facebook" | "github" | "apple";
  providerId: string;
  email?: string;
  connectedAt: Date;
}

// ─── Session Types ────────────────────────────────────────────────────────

export interface Session {
  id: string;
  userId: string;
  tokenId: string;
  deviceFingerprint: DeviceFingerprint;
  ipAddress: string;
  country?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  proofOfPossessionKey?: string | null;
  continuousEvalResult?: {
    decision: "allow" | "deny" | "challenge";
    riskScore: number;
    evaluatedAt: Date;
  } | null;
  anomalyFlags?: {
    deviceChangeDetected: boolean;
    locationChangeDetected: boolean;
    timeAnomalyDetected: boolean;
  } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DeviceFingerprint {
  hash: string;
  platform?: string;
  browser?: string;
  os?: string;
  screen?: string;
  timezone?: string;
  languages: string[];
  isTrusted: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

// ─── Role & Authorization Types ─────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  permissions: Permission[];
  parentRoleId?: string | null;
  isSystem: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: ABACCondition[];
}

export interface ABACCondition {
  attribute: string;
  operator: "eq" | "ne" | "in" | "nin" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: unknown;
}

export interface AuthzContext {
  user: User;
  session: Session;
  resource: string;
  action: string;
  resourceAttributes?: Record<string, unknown>;
  environment: {
    currentTime: Date;
    currentIp: string;
    currentCountry?: string;
    userAgent: string;
    riskScore?: number;
  };
}

export interface AuthzResult {
  decision: "allow" | "deny";
  reason?: string;
  riskScore: number;
  conditions?: string[];
  requiresMFA?: boolean;
  requiresStepUp?: boolean;
}

// ─── JIT & Privilege Types ────────────────────────────────────────────────

export interface JITAccessRequest {
  id: string;
  userId: string;
  roleId: string;
  reason: string;
  requestedAt: Date;
  expiresAt: Date;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  status: "pending" | "approved" | "denied" | "expired" | "revoked";
  revokedAt?: Date | null;
  revokedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Audit & Logging Types ────────────────────────────────────────────

export interface AuditLog {
  id?: string;
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  userAgent?: string | null;
  deviceHash?: string | null;
  sessionId?: string | null;
  success: boolean;
  errorCode?: string | null;
  duration?: number | null;
  resourceDetails?: Record<string, unknown> | null;
  riskScore?: number | null;
  continuousEvalContext?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  timestamp: Date;
}

// ─── Refresh Token Types ──────────────────────────────────────────────────

export interface RefreshTokenRecord {
  id?: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  isRevoked: boolean;
}

// ─── OTP Types ────────────────────────────────────────────────────────────

export interface OTP {
  id?: string;
  userId: string;
  code: string;
  type: "password_reset" | "email_verify" | "phone_verify" | "login";
  channel: "email" | "sms" | "whatsapp" | "telegram";
  target: string;
  expiresAt: Date;
  usedAt?: Date | null;
  attempts: number;
}

// ─── Workload Identity Types ──────────────────────────────────────────────

export interface WorkloadCredential {
  id?: string;
  workloadId: string;
  workloadSecret: string;
  createdBy?: string | null;
  scopes: string[];
  ttl?: number | null;
  autoRotate: boolean;
  lastRotatedAt?: Date | null;
  expiresAt?: Date | null;
  isRevoked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── OAuth & MFA Response Types ────────────────────────────────────────────

export interface OAuthAuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge?: string;
  redirectUri: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface MFAChallengeResponse {
  challengeId: string;
  expiresIn: number;
  channels: ("email" | "sms" | "whatsapp" | "telegram")[];
}

// ─── Hono Environment Type ────────────────────────────────────────────────

export type HonoEnv = {
  Variables: {
    user: User;
    session: Session;
    token: TokenPayload;
    popVerified?: boolean;
    inferredCountry?: string;
    tenantId?: string;
    apiKeyId?: string;
    apiKeyScopes?: string[];
    /** "live" or "test" — set by apiKeyAuth so handlers can branch to sandbox data. */
    apiKeyEnvironment?: "live" | "test";
    /** Negotiated API version (e.g. "v1"), set by the apiVersioning middleware. */
    apiVersion?: string;
    /** Org context for SCIM requests authenticated with a per-org token. */
    scimOrgId?: string;
    /** ID of the per-org SCIM token that authenticated the request. */
    scimTokenId?: string;
    /** Audit principal (agent/human + delegation chain) derived in auth middleware. */
    auditPrincipal?: { type: "human" | "agent"; id: string; workloadId?: string; actAs?: string[] };
    /** MCP principal for MCP-protected resource access. */
    mcpPrincipal?: { type: "human" | "agent"; id: string; workloadId?: string; actAs?: string[] };
    /** MCP token payload. */
    mcpToken?: Record<string, unknown>;
  };
};

// ─── Error Types ──────────────────────────────────────────────────────────

export class ZeroAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ZeroAuthError";
  }
}

export const ErrorCodes = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_INVALID: "MFA_INVALID",
  PASSKEY_NOT_FOUND: "PASSKEY_NOT_FOUND",
  ACCESS_DENIED: "ACCESS_DENIED",
  INSUFFICIENT_PRIVILEGE: "INSUFFICIENT_PRIVILEGE",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_DELETED: "USER_DELETED",
  DEVICE_NOT_TRUSTED: "DEVICE_NOT_TRUSTED",
  DEVICE_COMPROMISED: "DEVICE_COMPROMISED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  MAX_DEVICES_EXCEEDED: "MAX_DEVICES_EXCEEDED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  ACCESS_DENIED_LOCATION: "ACCESS_DENIED_LOCATION",
  ACCESS_DENIED_IP: "ACCESS_DENIED_IP",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

// ─── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_ACCESS_TOKEN_TTL = 3600;
export const DEFAULT_REFRESH_TOKEN_TTL = 604800;
export const DEFAULT_SESSION_TTL = 86400;
export const DEFAULT_OTP_TTL = 900;
export const DEFAULT_JIT_GRANT_TTL = 1800;
