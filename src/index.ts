/**
 * ZeroAuth Core - Root entry point
 * Exports all models, services, utilities, and types for external consumption
 */

// ─── Configuration ───────────────────────────────────────────────────────────
export { loadConfig, getConfig, resetConfig } from "./config";
export type { ZeroAuthConfig } from "./shared/types";

// ─── Database ────────────────────────────────────────────────────────────────
export {
  initializeDatabase,
  closeDatabase,
  checkDatabaseHealth,
  isDbConnected,
  dropAllCollections,
} from "./db";

// ─── Encryption (CSFLE) ──────────────────────────────────────────────────────
export {
  initializeCSFLE,
  getCSFLE,
  resetCSFLE,
  csflEncryptionPlugin,
  applyCSFLEToUserSchema,
  type EncryptionKeyVersion,
} from "./crypto/csfle";

// ─── Logging ─────────────────────────────────────────────────────────────────
export {
  initializeLogger,
  getLogger,
  createChildLogger,
  auditLog,
  resetLogger,
  generateCorrelationId,
  type LogContext,
  type LogLevel,
} from "./logger";

// ─── Shared Types ───────────────────────────────────────────────────────────
export type {
  ZeroAuthConfig,
  TokenPayload,
  AccessTokenResponse,
  User,
  Passkey,
  OAuthProvider,
  Session,
  DeviceFingerprint,
  Role,
  Permission,
  ABACCondition,
  AuthzContext,
  AuthzResult,
  JITAccessRequest,
  AuditLog,
  RefreshTokenRecord,
  OTP,
  WorkloadCredential,
  OAuthAuthorizationRequest,
  OAuthTokenResponse,
  MFAChallengeResponse,
} from "./shared/types";

export {
  ZeroAuthError,
  ErrorCodes,
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  DEFAULT_SESSION_TTL,
  DEFAULT_OTP_TTL,
  DEFAULT_JIT_GRANT_TTL,
} from "./shared/types";

// ─── Models ─────────────────────────────────────────────────────────────────
export { UserModel, type UserDocument } from "./models/user.model";
export {
  SessionModel,
  RoleModel,
  JITModel,
  AuditModel,
  RefreshTokenModel,
  OTPModel,
  type SessionDocument,
  type RoleDocument,
  type JITDocument,
  type AuditDocument,
  type RefreshTokenDocument,
  type OTPDocument,
} from "./models";

// ─── Services ───────────────────────────────────────────────────────────────
export { TokenService } from "./services/token.service";
export { AuthorizationEngine } from "./services/authz.service";
export { FingerprintService } from "./services/fingerprint.service";

/**
 * Initialize entire ZeroAuth system
 * Call this at application startup
 */
export async function initializeZeroAuth() {
  const { getConfig } = await import("./config");
  const { initializeDatabase } = await import("./db");
  const { initializeCSFLE } = await import("./crypto/csfle");
  const { initializeLogger } = await import("./logger");

  const config = getConfig();
  const logger = initializeLogger(config);

  logger.info("Initializing ZeroAuth system...");

  // Initialize database
  await initializeDatabase(config);

  // Initialize CSFLE
  await initializeCSFLE(config);

  logger.info("✓ ZeroAuth system initialized successfully");
  return { config, logger };
}

/**
 * Gracefully shutdown ZeroAuth system
 */
export async function shutdownZeroAuth() {
  const { getLogger } = await import("./logger");
  const { closeDatabase } = await import("./db");

  const logger = getLogger();
  logger.info("Shutting down ZeroAuth system...");

  try {
    await closeDatabase();
    logger.info("✓ ZeroAuth system shut down successfully");
  } catch (error) {
    logger.error("Error during shutdown:", error as Error);
  }
}
