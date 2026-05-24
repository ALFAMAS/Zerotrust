/**
 * ZeroAuth Core - Root entry point
 * Exports all models, services, utilities, and types for external consumption
 */

// ─── Configuration ───────────────────────────────────────────────────────────
export { loadConfig, getConfig, resetConfig } from "./config";

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
export {
  enforceMaxConcurrentDevices,
  revokeSession,
  revokeAllSessionsForUser,
  requireSessionLimitOnLogin,
} from "./middleware/sessionControl";
export { requireProofOfPossession, clearPoPNonces } from "./middleware/proofOfPossession";
export { rateLimit, initRateLimiter, clearRateLimiter } from "./middleware/rateLimiting";
export { geoFencingMiddleware } from "./middleware/geoFencing";
export { temporalAccessMiddleware } from "./middleware/temporalAccess";
export { createServer as createApiServer } from "./api/server";
export { sendOTP } from "./mfa";
export { requireFields, allowOnlyMethods, validate } from "./middleware/validation";
export { securityHeaders } from "./middleware/securityHeaders";
export {
  checkAccountLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  clearLockout,
  isAccountLocked,
} from "./middleware/accountLockout";
export {
  initAuditPipeline,
  queueAuditDoc,
  flushAuditPipeline,
  getElasticsearchHealth,
  shutdownAuditPipeline,
} from "./audit";
export { getProviderAdapter } from "./oauth/provider.factory";
export { handleSSFEvent } from "./ssf/receiver";
export { sendSSFEvent } from "./ssf/sender";
export { createWorkloadCredential, validateWorkloadCredential } from "./workload";

// ─── Magic Links ─────────────────────────────────────────────────────────────
export { sendMagicLink, verifyMagicLink } from "./services/magicLink.service";

// ─── FIDO2 Hardware Attestation ──────────────────────────────────────────────
export {
  verifyAttestation,
  verifyAttestationWithMDS3,
  getAttestationPolicy,
  KNOWN_HARDWARE_KEY_AAGUIDS,
  DEFAULT_POLICY as DEFAULT_ATTESTATION_POLICY,
  HIGH_ASSURANCE_POLICY,
} from "./mfa/attestation";
export type {
  AttestationPolicy,
  AttestationVerificationResult,
  AttestationVerificationResultWithMDS3,
} from "./mfa/attestation";

// ─── FIDO MDS3 ───────────────────────────────────────────────────────────────
export {
  initMDS3,
  getMDS3Entry,
  isFidoCertified,
  getDeviceDescription,
} from "./mfa/fido-mds3";
export type { MDS3Entry, MDS3StatusReport, MDS3Cache } from "./mfa/fido-mds3";

// ─── Attestation CA Pinning ───────────────────────────────────────────────────
export {
  pinAttestationCA,
  unpinAttestationCA,
  getAttestationCAPins,
  verifyAttestationCAPin,
} from "./mfa/attestation-ca-pin";
export type { AttestationCAPin } from "./mfa/attestation-ca-pin";

// ─── mTLS Middleware ──────────────────────────────────────────────────────────
export { requireMTLS, extractWorkloadIdentity } from "./middleware/mtls";
export type { mTLSOptions, WorkloadIdentity } from "./middleware/mtls";

// ─── FIDO2 Discoverable Credentials ──────────────────────────────────────────
export {
  generateDiscoverableRegistrationOptions,
  verifyDiscoverableRegistration,
  generateDiscoverableAuthenticationOptions,
  verifyDiscoverableAuthentication,
} from "./mfa/resident-keys";
export type { DiscoverableAuthenticator } from "./mfa/resident-keys";

// ─── Multi-Tenant ────────────────────────────────────────────────────────────
export { TenantModel } from "./models/tenant.model";
export type { TenantDocument } from "./models/tenant.model";
export { resolveTenant, requireTenant, withTenant } from "./middleware/tenant";

// ─── OIDC Provider ───────────────────────────────────────────────────────────
export {
  registerOIDCClient,
  getOIDCClient,
  validateAuthorizeRequest,
  issueAuthCode,
  exchangeCode as exchangeOIDCCode,
  buildUserInfo,
  getDiscoveryDocument,
} from "./oidc/provider";

// ─── SAML 2.0 ────────────────────────────────────────────────────────────────
export { buildAuthnRequest, parseSAMLResponse, buildSPMetadata } from "./saml/sp";
export type { SAMLAssertion, SAMLIdPConfig, SAMLSPConfig } from "./saml/sp";

// ─── Webhooks ────────────────────────────────────────────────────────────────
export { dispatchEvent, webhookStore, signPayload } from "./webhooks";
export type { WebhookEventType, WebhookEndpoint, WebhookDelivery } from "./webhooks/types";

// ─── Metrics ─────────────────────────────────────────────────────────────────
export { recordAuth, recordMFA, recordRateLimit, metricsRoute, metricsMiddleware } from "./metrics";

// ─── Telemetry ───────────────────────────────────────────────────────────────
export { initTelemetry, getTracer, withSpan, tracingMiddleware } from "./telemetry";

// ─── SCIM 2.0 ────────────────────────────────────────────────────────────────
export { scimRoutes } from "./scim";
export type { SCIMUser, SCIMGroup } from "./scim";

// ─── Multi-Tenant Rate Limiting ───────────────────────────────────────────────
export { tenantRateLimit, configureTenantQuota, getTenantQuota } from "./middleware/rateLimiting";

// ─── Cross-Tenant JIT ─────────────────────────────────────────────────────────
export { crossTenantJITStore, requestCrossTenantAccess, requireCrossTenantJIT } from "./jit/cross-tenant";
export type { CrossTenantJITRequest } from "./jit/cross-tenant";

// ─── LDAP / Active Directory ─────────────────────────────────────────────────
export { LDAPClient, createLDAPClient } from "./ldap/client";
export { syncAllUsers, syncModifiedUsers, scheduleLDAPSync } from "./ldap/sync";
export type { LDAPConfig, LDAPUser, LDAPGroup } from "./ldap/types";

// ─── Notifications (Slack / Teams / PagerDuty) ────────────────────────────────
export { notificationDispatcher, initNotificationsFromEnv } from "./notifications";
export type { NotificationEvent, NotificationChannel } from "./notifications/types";

// ─── Token Binding ────────────────────────────────────────────────────────────
export { verifyTokenBinding, attachTokenBinding, computeTokenBindingId, createTokenBindingConfig } from "./middleware/tokenBinding";

// ─── Hardware Key Storage ─────────────────────────────────────────────────────
export { initHardwareKeyStore, SoftwareKeyProvider, TPMKeyProvider, SecureEnclaveProvider, PKCS11Provider } from "./crypto/hardware-key-store";
export type { HardwareKeyProvider } from "./crypto/hardware-key-store";

// ─── Enterprise Attestation ───────────────────────────────────────────────────
export { enterpriseCARegistry, verifyEnterpriseAttestation, requireEnterpriseAttestation, parseCertificate } from "./mfa/enterprise-attestation";
export type { EnterpriseAttestationCA, EnterpriseCertificate } from "./mfa/enterprise-attestation";

// ─── Decentralized Identity (DID) ─────────────────────────────────────────────
export { resolveDID, resolveDIDKey, resolveDIDWeb } from "./did/resolver";
export { createDIDChallenge, verifyDIDProof, provisionDIDUser } from "./did/verifier";
export type { DIDDocument, DIDAuthChallenge, DIDProof, DIDAuthResult, VerificationMethod } from "./did/types";

// ─── Post-Quantum Cryptography ────────────────────────────────────────────────
export { createKEMProvider, generatePQKeyPair, hybridEncrypt, hybridDecrypt, SimulatedMLKEM, NobleMLKEM, establishPQSessionKey } from "./crypto/post-quantum";
export type { KEMPublicKey, KEMPrivateKey, KEMEncapsulation, PQKEMProvider } from "./crypto/post-quantum";

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

  // Initialize rate limiter (optional Redis-backed)
  try {
    const { initRateLimiter } = await import("./middleware/rateLimiting");
    await initRateLimiter();
  } catch (err) {
    logger.warn("Rate limiter initialization skipped or failed", err as Error);
  }

  // Initialize Elasticsearch audit pipeline
  try {
    const { initAuditPipeline } = await import("./audit");
    await initAuditPipeline();
  } catch (err) {
    logger.warn("Audit pipeline initialization skipped or failed", err as Error);
  }

  // Initialize auth middleware (token service)
  try {
    const { initAuthMiddleware } = await import("./middleware/auth");
    await initAuthMiddleware();
  } catch (err) {
    logger.warn("Auth middleware initialization skipped or failed", err as Error);
  }

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
    const { shutdownAuditPipeline } = await import("./audit");
    await shutdownAuditPipeline();
  } catch {
    // best effort
  }

  try {
    await closeDatabase();
    logger.info("✓ ZeroAuth system shut down successfully");
  } catch (error) {
    logger.error("Error during shutdown:", error as Error);
  }
}
