// ─── Configuration ───────────────────────────────────────────────────────────

export { createServer as createApiServer } from "./api/server";
export {
  flushAuditPipeline,
  getElasticsearchHealth,
  initAuditPipeline,
  queueAuditDoc,
  shutdownAuditPipeline,
} from "./audit";
export { getConfig, loadConfig, resetConfig } from "./config";

// ─── Encryption (CSFLE) ──────────────────────────────────────────────────────
export {
  type EncryptionKeyVersion,
  getCSFLE,
  initializeCSFLE,
  resetCSFLE,
} from "./crypto/csfle";
export type { HardwareKeyProvider } from "./crypto/hardware-key-store";
// ─── Hardware Key Storage ─────────────────────────────────────────────────────
export {
  initHardwareKeyStore,
  PKCS11Provider,
  SecureEnclaveProvider,
  SoftwareKeyProvider,
  TPMKeyProvider,
} from "./crypto/hardware-key-store";
export type { DatabaseHealth } from "./db";
// ─── Database ────────────────────────────────────────────────────────────────
export {
  checkDatabaseHealth,
  closeDatabase,
  dropAllTables,
  getDb,
  getReadDb,
  hasReadReplica,
  initializeDatabase,
  isDbConnected,
} from "./db";
// ─── Schema ──────────────────────────────────────────────────────────────────
export {
  auditLogsTable,
  jitAccessTable,
  otpsTable,
  refreshTokensTable,
  rolesTable,
  saasSettingsTable,
  sessionsTable,
  usersTable,
} from "./db/schema";
export type { CrossTenantJITRequest } from "./jit/cross-tenant";
// ─── Cross-Tenant JIT ─────────────────────────────────────────────────────────
export {
  crossTenantJITStore,
  requestCrossTenantAccess,
  requireCrossTenantJIT,
} from "./jit/cross-tenant";
// ─── Logging ─────────────────────────────────────────────────────────────────
export {
  auditLog,
  createChildLogger,
  generateCorrelationId,
  getLogger,
  initializeLogger,
  type LogContext,
  type LogLevel,
  resetLogger,
} from "./logger";
// ─── Metrics ─────────────────────────────────────────────────────────────────
export {
  metricsMiddleware,
  metricsRoute,
  recordAuth,
  recordMFA,
  recordRateLimit,
} from "./metrics";
export { sendOTP } from "./mfa";
export type {
  AttestationPolicy,
  AttestationVerificationResult,
  AttestationVerificationResultWithMDS3,
} from "./mfa/attestation";
// ─── FIDO2 Hardware Attestation ──────────────────────────────────────────────
export {
  DEFAULT_POLICY as DEFAULT_ATTESTATION_POLICY,
  getAttestationPolicy,
  HIGH_ASSURANCE_POLICY,
  KNOWN_HARDWARE_KEY_AAGUIDS,
  verifyAttestation,
  verifyAttestationWithMDS3,
} from "./mfa/attestation";
export type { AttestationCAPin } from "./mfa/attestation-ca-pin";
// ─── Attestation CA Pinning ───────────────────────────────────────────────────
export {
  getAttestationCAPins,
  pinAttestationCA,
  unpinAttestationCA,
  verifyAttestationCAPin,
} from "./mfa/attestation-ca-pin";
export type {
  EnterpriseAttestationCA,
  EnterpriseCertificate,
} from "./mfa/enterprise-attestation";
// ─── Enterprise Attestation ───────────────────────────────────────────────────
export {
  enterpriseCARegistry,
  parseCertificate,
  requireEnterpriseAttestation,
  verifyEnterpriseAttestation,
} from "./mfa/enterprise-attestation";
export type { MDS3Cache, MDS3Entry, MDS3StatusReport } from "./mfa/fido-mds3";
// ─── FIDO MDS3 ───────────────────────────────────────────────────────────────
export {
  getDeviceDescription,
  getMDS3Entry,
  initMDS3,
  isFidoCertified,
} from "./mfa/fido-mds3";
export type { DiscoverableAuthenticator } from "./mfa/resident-keys";
// ─── FIDO2 Discoverable Credentials ──────────────────────────────────────────
export {
  generateDiscoverableAuthenticationOptions,
  generateDiscoverableRegistrationOptions,
  verifyDiscoverableAuthentication,
  verifyDiscoverableRegistration,
} from "./mfa/resident-keys";
export {
  checkAccountLockout,
  clearLockout,
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "./middleware/accountLockout";
export type { AnomalyMiddlewareOptions } from "./middleware/anomalyMiddleware";
// ─── Anomaly Detection ────────────────────────────────────────────────────────
export { anomalyDetectionMiddleware } from "./middleware/anomalyMiddleware";
export type { ContinuousVerificationOptions } from "./middleware/continuousVerification";
// ─── Continuous Verification ──────────────────────────────────────────────────
export {
  getVerification,
  recordVerification,
  requireReverification,
} from "./middleware/continuousVerification";
export { geoFencingMiddleware } from "./middleware/geoFencing";
export {
  clearPoPNonces,
  requireProofOfPossession,
} from "./middleware/proofOfPossession";
// ─── Multi-Tenant Rate Limiting ───────────────────────────────────────────────
export {
  clearRateLimiter,
  configureTenantQuota,
  getTenantQuota,
  initRateLimiter,
  rateLimit,
  tenantRateLimit,
} from "./middleware/rateLimiting";
export {
  enforceMaxConcurrentDevices,
  revokeAllSessionsForUser,
  revokeSession,
} from "./middleware/sessionControl";
export { temporalAccessMiddleware } from "./middleware/temporalAccess";
export { requireTenant, resolveTenant } from "./middleware/tenant";
export type { TokenBindingOptions } from "./middleware/tokenBinding";
// ─── Token Binding ────────────────────────────────────────────────────────────
export { tokenBindingMiddleware } from "./middleware/tokenBinding";
export { allowOnlyMethods, requireFields } from "./middleware/validation";
export type {
  CreateTenantData,
  OidcConfig,
  SamlConfig,
  Tenant,
  TenantSettings,
  UpdateTenantData,
} from "./models/tenant.model";
// ─── Multi-Tenant ────────────────────────────────────────────────────────────
export {
  createTenant,
  deleteTenant,
  getAllTenants,
  getTenant,
  getTenantBySlug,
  updateTenant,
} from "./models/tenant.model";
// ─── Notifications (Slack / Teams / PagerDuty) ────────────────────────────────
export {
  initNotificationsFromEnv,
  notificationDispatcher,
} from "./notifications";
export type {
  NotificationChannel,
  NotificationEvent,
} from "./notifications/types";
export { getProviderAdapter } from "./oauth/provider.factory";
export type {
  AnomalySignals,
  BehaviorObservation,
} from "./services/auth/anomalyDetection.service";
export {
  computeDeviceHash,
  getBaseline,
  resetBaseline,
  scoreAnomaly,
  updateBaseline,
} from "./services/auth/anomalyDetection.service";
export { AuthorizationEngine } from "./services/auth/authz.service";
export { FingerprintService } from "./services/auth/fingerprint.service";
// ─── Magic Links ─────────────────────────────────────────────────────────────
export { sendMagicLink, verifyMagicLink } from "./services/auth/magicLink.service";
export type {
  RiskAssessment,
  RiskFactors,
} from "./services/auth/sessionRisk.service";
export {
  assessSessionRisk,
  computeRiskFactors,
} from "./services/auth/sessionRisk.service";
// ─── Services ───────────────────────────────────────────────────────────────
export { TokenService } from "./services/auth/token.service";
// ─── Shared Types ───────────────────────────────────────────────────────────
export type {
  ABACCondition,
  AccessTokenResponse,
  AuditLog,
  AuthzContext,
  AuthzResult,
  DeviceFingerprint,
  HonoEnv,
  JITAccessRequest,
  MFAChallengeResponse,
  OAuthAuthorizationRequest,
  OAuthProvider,
  OAuthTokenResponse,
  OTP,
  Passkey,
  Permission,
  RefreshTokenRecord,
  Role,
  Session,
  TokenPayload,
  User,
  zerotrustConfig,
} from "./shared/types";
export {
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_JIT_GRANT_TTL,
  DEFAULT_OTP_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  DEFAULT_SESSION_TTL,
  ErrorCodes,
  zerotrustError,
} from "./shared/types";
export { handleSSFEvent } from "./ssf/receiver";
export { sendSSFEvent } from "./ssf/sender";
// ─── Telemetry ───────────────────────────────────────────────────────────────
export {
  getTracer,
  initTelemetry,
  telemetryMiddleware,
  withSpan,
} from "./telemetry";
// ─── Webhooks ────────────────────────────────────────────────────────────────
export { dispatchEvent, signPayload, webhookStore } from "./webhooks";
export type {
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEventType,
} from "./webhooks/types";

export async function initializezerotrust() {
  const { getConfig } = await import("./config/index.js");
  const { initializeDatabase, checkPendingMigrations } = await import("./db/index.js");
  const { initializeCSFLE } = await import("./crypto/csfle.js");
  const { initializeLogger } = await import("./logger/index.js");

  const config = getConfig();
  const logger = initializeLogger(config);

  logger.info("Initializing zerotrust system...");

  await initializeDatabase();
  await checkPendingMigrations();

  await initializeCSFLE(config);

  try {
    const { initRateLimiter } = await import("./middleware/rateLimiting.js");
    await initRateLimiter();
  } catch (err) {
    logger.warn("Rate limiter initialization skipped or failed", {
      error: String(err),
    });
  }

  // Initialize Elasticsearch audit pipeline
  try {
    const { initAuditPipeline } = await import("./audit/index.js");
    await initAuditPipeline();
  } catch (err) {
    logger.warn("Audit pipeline initialization skipped or failed", {
      error: String(err),
    });
  }

  try {
    const { initAuthMiddleware } = await import("./middleware/auth.js");
    await initAuthMiddleware();
  } catch (err) {
    logger.warn("Auth middleware initialization skipped or failed", {
      error: String(err),
    });
  }

  logger.info("✓ zerotrust system initialized successfully");
  return { config, logger };
}

export async function shutdownzerotrust() {
  const { getLogger } = await import("./logger/index.js");
  const { closeDatabase } = await import("./db/index.js");

  const logger = getLogger();
  logger.info("Shutting down zerotrust system...");

  try {
    const { shutdownAuditPipeline } = await import("./audit/index.js");
    await shutdownAuditPipeline();
  } catch {
    // best effort
  }

  try {
    await closeDatabase();
    logger.info("✓ zerotrust system shut down successfully");
  } catch (error) {
    logger.error("Error during shutdown:", error as Error);
  }
}
