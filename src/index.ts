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
export { type EncryptionKeyVersion, getCSFLE, initializeCSFLE, resetCSFLE } from "./crypto/csfle";
export type { HardwareKeyProvider } from "./crypto/hardware-key-store";
// ─── Hardware Key Storage ─────────────────────────────────────────────────────
export {
  initHardwareKeyStore,
  PKCS11Provider,
  SecureEnclaveProvider,
  SoftwareKeyProvider,
  TPMKeyProvider,
} from "./crypto/hardware-key-store";
export type {
  KEMEncapsulation,
  KEMPrivateKey,
  KEMPublicKey,
  PQKEMProvider,
} from "./crypto/post-quantum";
// ─── Post-Quantum Cryptography ────────────────────────────────────────────────
export {
  createKEMProvider,
  establishPQSessionKey,
  generatePQKeyPair,
  hybridDecrypt,
  hybridEncrypt,
  NobleMLKEM,
  SimulatedMLKEM,
} from "./crypto/post-quantum";
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
export type { DatabaseHealth } from "./db";
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
  workloadCredentialsTable,
} from "./db/schema";
// ─── Decentralized Identity (DID) ─────────────────────────────────────────────
export { resolveDID, resolveDIDKey, resolveDIDWeb } from "./did/resolver";
export type {
  DIDAuthChallenge,
  DIDAuthResult,
  DIDDocument,
  DIDProof,
  VerificationMethod,
} from "./did/types";
export { createDIDChallenge, provisionDIDUser, verifyDIDProof } from "./did/verifier";
export type {
  FederatedProvider,
  FederationTokenRequest,
  FederationTokenResponse,
} from "./federation/index";
// ─── Cross-Tenant Federation ──────────────────────────────────────────────────
export {
  exchangeToken as exchangeFederatedToken,
  getProvider as getFederationProvider,
  initFederationFromEnv,
  listProviders as listFederationProviders,
  registerProvider as registerFederationProvider,
  removeProvider as removeFederationProvider,
  requireFederatedIdentity,
} from "./federation/index";
export type { CrossTenantJITRequest } from "./jit/cross-tenant";
// ─── Cross-Tenant JIT ─────────────────────────────────────────────────────────
export {
  crossTenantJITStore,
  requestCrossTenantAccess,
  requireCrossTenantJIT,
} from "./jit/cross-tenant";
// ─── LDAP / Active Directory ─────────────────────────────────────────────────
export { createLDAPClient, LDAPClient } from "./ldap/client";
export { scheduleLDAPSync, syncAllUsers, syncModifiedUsers } from "./ldap/sync";
export type { LDAPConfig, LDAPGroup, LDAPUser } from "./ldap/types";
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
export { metricsMiddleware, metricsRoute, recordAuth, recordMFA, recordRateLimit } from "./metrics";
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
export type { EnterpriseAttestationCA, EnterpriseCertificate } from "./mfa/enterprise-attestation";
// ─── Enterprise Attestation ───────────────────────────────────────────────────
export {
  enterpriseCARegistry,
  parseCertificate,
  requireEnterpriseAttestation,
  verifyEnterpriseAttestation,
} from "./mfa/enterprise-attestation";
export type { MDS3Cache, MDS3Entry, MDS3StatusReport } from "./mfa/fido-mds3";
// ─── FIDO MDS3 ───────────────────────────────────────────────────────────────
export { getDeviceDescription, getMDS3Entry, initMDS3, isFidoCertified } from "./mfa/fido-mds3";
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
export type { mTLSOptions, WorkloadIdentity } from "./middleware/mtls";
// ─── mTLS Middleware ──────────────────────────────────────────────────────────
export { mtlsMiddleware } from "./middleware/mtls";
export { clearPoPNonces, requireProofOfPossession } from "./middleware/proofOfPossession";
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
export { initNotificationsFromEnv, notificationDispatcher } from "./notifications";
export type { NotificationChannel, NotificationEvent } from "./notifications/types";
export { getProviderAdapter } from "./oauth/provider.factory";
// ─── OIDC Provider ───────────────────────────────────────────────────────────
export {
  buildUserInfo,
  exchangeAuthCode as exchangeOIDCCode,
  generateAuthCode,
  getDiscoveryDocument,
  getOIDCClient,
  registerOIDCClient,
  validateAuthorizeRequest,
} from "./oidc/provider";
export type { SAMLAssertion, SAMLIdPConfig, SAMLSPConfig } from "./saml/sp";
// ─── SAML 2.0 ────────────────────────────────────────────────────────────────
export { buildAuthnRequest, buildSPMetadata, parseSAMLResponse } from "./saml/sp";
export type { SCIMGroup, SCIMUser } from "./scim";
// ─── SCIM 2.0 ────────────────────────────────────────────────────────────────
export { scimRoutes } from "./scim";
export type { AnomalySignals, BehaviorObservation } from "./services/anomalyDetection.service";
export {
  computeDeviceHash,
  getBaseline,
  resetBaseline,
  scoreAnomaly,
  updateBaseline,
} from "./services/anomalyDetection.service";
export { AuthorizationEngine } from "./services/authz.service";
export { FingerprintService } from "./services/fingerprint.service";
// ─── Magic Links ─────────────────────────────────────────────────────────────
export { sendMagicLink, verifyMagicLink } from "./services/magicLink.service";
export type { RiskAssessment, RiskFactors } from "./services/sessionRisk.service";
export { assessSessionRisk, computeRiskFactors } from "./services/sessionRisk.service";
// ─── Services ───────────────────────────────────────────────────────────────
export { TokenService } from "./services/token.service";
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
  WorkloadCredential,
  ZeroAuthConfig,
} from "./shared/types";
export {
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_JIT_GRANT_TTL,
  DEFAULT_OTP_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  DEFAULT_SESSION_TTL,
  ErrorCodes,
  ZeroAuthError,
} from "./shared/types";
export { handleSSFEvent } from "./ssf/receiver";
export { sendSSFEvent } from "./ssf/sender";
// ─── Telemetry ───────────────────────────────────────────────────────────────
export { getTracer, initTelemetry, telemetryMiddleware, withSpan } from "./telemetry";
// ─── Webhooks ────────────────────────────────────────────────────────────────
export { dispatchEvent, signPayload, webhookStore } from "./webhooks";
export type { WebhookDelivery, WebhookEndpoint, WebhookEventType } from "./webhooks/types";
export { createWorkloadCredential, validateWorkloadCredential } from "./workload";

export async function initializeZeroAuth() {
  const { getConfig } = await import("./config/index.js");
  const { initializeDatabase, checkPendingMigrations } = await import("./db/index.js");
  const { initializeCSFLE } = await import("./crypto/csfle.js");
  const { initializeLogger } = await import("./logger/index.js");

  const config = getConfig();
  const logger = initializeLogger(config);

  logger.info("Initializing ZeroAuth system...");

  await initializeDatabase();
  await checkPendingMigrations();

  await initializeCSFLE(config);

  try {
    const { initRateLimiter } = await import("./middleware/rateLimiting.js");
    await initRateLimiter();
  } catch (err) {
    logger.warn("Rate limiter initialization skipped or failed", { error: String(err) });
  }

  // Initialize Elasticsearch audit pipeline
  try {
    const { initAuditPipeline } = await import("./audit/index.js");
    await initAuditPipeline();
  } catch (err) {
    logger.warn("Audit pipeline initialization skipped or failed", { error: String(err) });
  }

  try {
    const { initAuthMiddleware } = await import("./middleware/auth.js");
    await initAuthMiddleware();
  } catch (err) {
    logger.warn("Auth middleware initialization skipped or failed", { error: String(err) });
  }

  logger.info("✓ ZeroAuth system initialized successfully");
  return { config, logger };
}

export async function shutdownZeroAuth() {
  const { getLogger } = await import("./logger/index.js");
  const { closeDatabase } = await import("./db/index.js");

  const logger = getLogger();
  logger.info("Shutting down ZeroAuth system...");

  try {
    const { shutdownAuditPipeline } = await import("./audit/index.js");
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
