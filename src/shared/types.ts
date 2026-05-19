/**
 * Shared type definitions for ZeroAuth system
 * Used across models, services, and middleware
 */

import type { ObjectId } from "mongoose";

// ─── Configuration Types ─────────────────────────────────────────────────────

export interface ZeroAuthConfig {
  database: {
    mongoUri: string;
    connectionPoolSize: number;
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
  sub: string; // user ID
  email: string;
  sid: string; // session ID
  jti: string; // JWT ID (unique token identifier)
  iat: number; // issued at
  exp: number; // expiration
  aud?: string; // audience
  iss?: string; // issuer
  scope?: string[];
  pop_key?: string; // proof of possession public key
}

export interface AccessTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: "Bearer";
}

// ─── User Types ───────────────────────────────────────────────────────────

export interface User {
  _id?: ObjectId;
  email: string;
  username?: string;
  passwordHash?: string;
  phone?: string;
  displayName: string;
  avatarUrl?: string;
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
  parentUserId?: ObjectId;
  subUserIds: ObjectId[];
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
  lastLoginAt?: Date;
  metadata?: Record<string, unknown>;
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
  _id?: ObjectId;
  userId: ObjectId;
  tokenId: string;
  deviceFingerprint: DeviceFingerprint;
  ipAddress: string;
  country?: string;
  userAgent: string;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  revokedAt?: Date;
  revokedReason?: string;
  proofOfPossessionKey?: string;
  continuousEvalResult?: {
    decision: "allow" | "deny" | "challenge";
    riskScore: number;
    evaluatedAt: Date;
  };
  anomalyFlags?: {
    deviceChangeDetected: boolean;
    locationChangeDetected: boolean;
    timeAnomalyDetected: boolean;
  };
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
  _id?: ObjectId;
  name: string;
  displayName: string;
  description?: string;
  permissions: Permission[];
  parentRoleId?: ObjectId;
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
  _id?: ObjectId;
  userId: ObjectId;
  roleId: ObjectId;
  reason: string;
  requestedAt: Date;
  expiresAt: Date;
  approvedBy?: ObjectId;
  approvedAt?: Date;
  status: "pending" | "approved" | "denied" | "expired" | "revoked";
  revokedAt?: Date;
  revokedBy?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Audit & Logging Types ────────────────────────────────────────────

export interface AuditLog {
  _id?: ObjectId;
  action: string;
  actorId?: ObjectId;
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  deviceHash?: string;
  sessionId?: string;
  success: boolean;
  errorCode?: string;
  duration?: number;
  resourceDetails?: Record<string, unknown>;
  riskScore?: number;
  continuousEvalContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// ─── Refresh Token Types ──────────────────────────────────────────────────

export interface RefreshTokenRecord {
  _id?: ObjectId;
  userId: ObjectId;
  sessionId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  isRevoked: boolean;
}

// ─── OTP Types ────────────────────────────────────────────────────────────

export interface OTP {
  userId: ObjectId;
  code: string;
  type: "password_reset" | "email_verify" | "phone_verify" | "login";
  channel: "email" | "sms" | "whatsapp" | "telegram";
  target: string;
  expiresAt: Date;
  usedAt?: Date;
  attempts: number;
}

// ─── Workload Identity Types ──────────────────────────────────────────────

export interface WorkloadCredential {
  _id?: ObjectId;
  workloadId: string;
  workloadSecret: string;
  createdBy: ObjectId;
  scopes: string[];
  ttl: number;
  autoRotate: boolean;
  lastRotatedAt?: Date;
  expiresAt: Date;
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

// Common error codes
export const ErrorCodes = {
  // Authentication
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_INVALID: "MFA_INVALID",
  PASSKEY_NOT_FOUND: "PASSKEY_NOT_FOUND",

  // Authorization
  ACCESS_DENIED: "ACCESS_DENIED",
  INSUFFICIENT_PRIVILEGE: "INSUFFICIENT_PRIVILEGE",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

  // User Management
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_DELETED: "USER_DELETED",

  // Device & Session
  DEVICE_NOT_TRUSTED: "DEVICE_NOT_TRUSTED",
  DEVICE_COMPROMISED: "DEVICE_COMPROMISED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  MAX_DEVICES_EXCEEDED: "MAX_DEVICES_EXCEEDED",

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",

  // Geofencing
  ACCESS_DENIED_LOCATION: "ACCESS_DENIED_LOCATION",
  ACCESS_DENIED_IP: "ACCESS_DENIED_IP",

  // General
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

// ─── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_ACCESS_TOKEN_TTL = 3600; // 1 hour
export const DEFAULT_REFRESH_TOKEN_TTL = 604800; // 7 days
export const DEFAULT_SESSION_TTL = 86400; // 24 hours
export const DEFAULT_OTP_TTL = 900; // 15 minutes
export const DEFAULT_JIT_GRANT_TTL = 1800; // 30 minutes
