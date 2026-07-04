export interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    total?: number;
    totalPages?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface Wallet {
  balance: number;
  lifetimeBalance: number;
  currency: string;
  autoTopUp: boolean;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string | null;
  createdAt?: string;
  optimistic?: boolean;
}

export interface WalletTransactionsParams {
  limit?: number;
  page?: number;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempt: number;
  responseStatus: number | null;
  error: string | null;
  recordedAt: string;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
}

export interface WebhookDeliveriesParams {
  limit?: number;
}

export interface CreateWebhookEndpointInput {
  url: string;
  secret: string;
  events: string[];
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  authorRole: "user" | "agent";
  body: string;
  createdAt: string;
}

export interface SupportTicketsResponse {
  tickets: SupportTicket[];
  scope?: "mine" | "all";
}

export interface SupportThreadResponse {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

export interface CreateSupportTicketInput {
  subject: string;
  message: string;
  priority?: "low" | "normal" | "high";
}

export interface AuditEntry {
  id: string;
  action: string;
  success?: boolean;
  status?: string;
  actorEmail?: string;
  userEmail?: string;
  user?: string;
  userId?: string;
  ip?: string;
  ipAddress?: string;
  timestamp?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  resourceDetails?: Record<string, unknown>;
}

export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

export type JitRequestStatus = "pending" | "approved" | "denied" | "expired";

export interface JitRequest {
  id: string;
  requestorUserId: string;
  requestorOrgId: string;
  targetOrgId: string;
  targetResource: string;
  justification: string;
  ttlSeconds: number;
  status: JitRequestStatus;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface CreateJitRequestInput {
  targetOrgId: string;
  requestorOrgId?: string;
  targetResource: string;
  justification: string;
  ttlSeconds: number;
}

export interface NotificationPreferences {
  emailFallback: boolean;
  emailFallbackDays: number;
  categories?: Record<string, { email?: boolean; push?: boolean; inApp?: boolean }>;
}

export type UpdateNotificationPreferencesInput = Partial<NotificationPreferences>;

export type Soc2ControlStatus = "implemented" | "partial" | "planned";

export interface Soc2Control {
  controlId: string;
  category: string;
  title: string;
  description?: string;
  implementation: string;
  evidence?: string;
  status: Soc2ControlStatus;
  lastReviewedAt?: string;
  reviewedBy?: string;
}

export interface Soc2Readiness {
  total: number;
  implemented: number;
  partial: number;
  planned: number;
  readinessPercent: number;
}

export type RiskItemStatus = "open" | "mitigated" | "closed";
export type RiskTreatment = "mitigate" | "accept" | "transfer" | "avoid";

export interface RiskItem {
  year: number;
  riskId: string;
  category: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  treatment: RiskTreatment;
  mitigation: string;
  owner: string;
  status: RiskItemStatus;
}

export interface RiskAssessment {
  year: number;
  totalRisks: number;
  openRisks: number;
  mitigatedRisks: number;
  closedRisks: number;
  avgRiskScore: number;
  risks: RiskItem[];
}

export interface RollingStats {
  mean: number;
  variance: number;
  count: number;
}

export interface AnomalyBaseline {
  id: string;
  userId: string;
  loginHourStats?: RollingStats;
  sessionDurationStats?: RollingStats;
  knownIps?: string[];
  knownCountries?: string[];
  knownDevices?: string[];
  totalLogins?: number;
  lastUpdatedAt?: string;
  createdAt?: string;
}

export interface AnomalySignals {
  unknownIp: boolean;
  unknownCountry: boolean;
  unknownDevice: boolean;
  unusualHour: boolean;
  overallScore: number;
  flags: string[];
}

export interface AnomalyBaselinesListParams {
  limit?: number;
  page?: number;
}

export interface ScoreLoginInput {
  userId: string;
  ip: string;
  country?: string | null;
  deviceHash: string;
  loginHour: number;
}

export interface GeneralSettings {
  appName: string;
  appUrl: string;
  supportEmail: string;
  logoUrl: string;
}

export type NotificationType = "info" | "success" | "warning" | "error" | "security";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsUnreadCount {
  count: number;
}

export interface AuthMeMfa {
  totp?: {
    enabled?: boolean;
    verifiedAt?: string | null;
    backupCodesRemaining?: number;
  };
  webauthn?: { enabled?: boolean };
}

export interface AuthMePasskey {
  credentialId: string;
  name: string;
  deviceType?: string;
  aaguid?: string;
  backedUp?: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface AuthMe {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  roles?: string[];
  status?: string;
  phone?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  locale?: string;
  metadata?: Record<string, unknown>;
  attributes?: { emailVerified?: boolean };
  mfa?: AuthMeMfa;
  passkeys?: AuthMePasskey[];
  oauthProviders?: Array<{ provider: string; email?: string; connectedAt?: string }>;
}

export interface PatchAuthMeInput {
  displayName?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  username?: string | null;
  locale?: string;
}

export interface NpsShouldPrompt {
  shouldPrompt: boolean;
}

export interface SubmitNpsInput {
  score: number;
  comment?: string;
}

export type AdminUserStatus = "active" | "suspended" | "deleted" | string;
export type CustomerSegment = "champion" | "at_risk" | "expansion" | "new";

export interface AdminUserListItem {
  id: string;
  displayName?: string;
  email: string;
  status: AdminUserStatus;
  roles?: string[];
  emailVerifiedAt?: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminUsersListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface UpdateAdminUserListStatusInput {
  id: string;
  status: AdminUserStatus;
}

export interface AdminUserDetail {
  id: string;
  displayName?: string;
  username?: string | null;
  phone?: string | null;
  email: string;
  status: AdminUserStatus;
  roles?: string[];
  locale?: string;
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  mfa?: {
    totpEnabled?: boolean;
    webauthnEnabled?: boolean;
  };
  passkeyCount?: number;
  oauthProviders?: string[];
  activeSessions?: number;
  sessionsCount?: number;
  customerSegment?: CustomerSegment | string | null;
}

export interface AdminSession {
  id: string;
  userId?: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  deviceFingerprint?: {
    platform?: string;
    browser?: string;
    os?: string;
    isTrusted?: boolean;
  } | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  isActive?: boolean;
  revokedAt?: string | null;
  revokedReason?: string | null;
  anomalyFlags?: unknown;
  createdAt: string;
  lastActivityAt?: string | null;
  expiresAt?: string | null;
}

export interface AdminSessionsListParams {
  page?: number;
  limit?: number;
}

export type OAuthProvider = "google" | "github";

export interface GdprDeletionResponse {
  scheduledFor?: string;
  message?: string;
}

export type AlertChannelType = "slack" | "teams" | "pagerduty";

export interface AlertChannel {
  id: string;
  type: AlertChannelType;
  name: string;
  enabled: boolean;
  events: string[];
  config: { webhookUrl?: string; integrationKey?: string };
}

export interface AlertChannelsResponse {
  channels: AlertChannel[];
}

export interface CreateAlertChannelInput {
  type: AlertChannelType;
  name: string;
  enabled: boolean;
  events: string[];
  config: { webhookUrl?: string; integrationKey?: string };
}

export interface AccessReview {
  id: string;
  title: string;
  status: "open" | "completed" | string;
  createdByEmail?: string | null;
  createdAt: string;
  completedAt?: string | null;
  note?: string | null;
  itemCount?: number;
  pendingCount?: number;
}

export interface AccessReviewItem {
  id: string;
  userId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  rolesSnapshot: string[];
  decision: "pending" | "approved" | "revoked" | "flagged" | string;
  decidedByEmail?: string | null;
  decidedAt?: string | null;
  note?: string | null;
}

export interface AccessReviewsListResponse {
  reviews: AccessReview[];
}

export interface AccessReviewDetailResponse {
  review: AccessReview;
  items: AccessReviewItem[];
}

export type AccessReviewDecision = "approved" | "revoked" | "flagged";

export interface StartAccessReviewResponse {
  itemCount: number;
}

export interface RevenueData {
  mrr: number;
  arr: number;
  currency: string;
  activeSubscriptions: number;
  byPlan: Record<string, number>;
  trialing: number;
  pastDue: number;
  canceledLast30Days: number;
  churnRatePercent: number;
}

export interface BroadcastInput {
  title: string;
  message: string;
  segment: string;
  sendEmail?: boolean;
}

export interface BroadcastResponse {
  recipients: number;
}

export type SearchHitType = "user" | "org" | "note" | "ticket";

export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  highlight?: string;
  score: number;
}

export interface SearchResults {
  total: number;
  hits: SearchHit[];
  provider: "elasticsearch" | "database";
}

export interface SearchParams {
  q: string;
  type?: string;
  limit?: number;
}

export interface UserSession {
  id: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  deviceFingerprint?: {
    platform?: string;
    browser?: string;
    os?: string;
    isTrusted?: boolean;
  };
  isActive: boolean;
  isCurrent?: boolean;
  expiresAt?: string;
  lastActivityAt?: string;
  createdAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  billingEmail?: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  joinedAt?: string | null;
  createdAt?: string;
}

export interface OrgMembership {
  member: OrganizationMember;
  org: Organization;
}

export interface OrganizationsListResponse {
  orgs: OrgMembership[];
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  environment?: "live" | "test";
  keyPrefix: string;
  scopes?: string[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt?: string;
}

export interface CreateApiKeyInput {
  name: string;
  environment?: string;
  expiresInDays?: number;
}

export interface CreateApiKeyResponse {
  key: string;
}

export interface TotpSetupResponse {
  qrCodeUrl: string;
  secret?: string;
}

export interface TotpVerifyResponse {
  backupCodes?: string[];
}

export interface LoginTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends LoginTokens {
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  powChallenge?: string;
  powSolution?: string;
}

export interface PasswordResetRequestInput {
  email: string;
}

export interface PasswordResetConfirmInput {
  email: string;
  code: string;
  newPassword: string;
}

export interface VerifyEmailInput {
  code: string;
}

export interface SendMagicLinkInput {
  email: string;
  redirectUrl?: string;
}

export interface VerifyMagicLinkInput {
  email: string;
  token: string;
}

export interface PasskeyAuthOptionsInput {
  email?: string;
}

export interface PasskeyAuthVerifyInput extends Record<string, unknown> {
  challengeKey?: string;
  email?: string;
}

export interface OAuthExchangeInput {
  code: string;
}

export interface OrgDetailResponse {
  org: Organization;
  memberCount: number;
}

export interface OrgMemberUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface OrgMemberRow {
  member: OrganizationMember;
  user: OrgMemberUser;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface MyOrgInvite {
  invite: OrgInvite;
  org: Pick<Organization, "id" | "name" | "slug">;
}

export interface CreateOrgInviteInput {
  email: string;
  role: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  billingEmail?: string;
  logoUrl?: string;
}

export interface OrgSecurityPolicy {
  orgId: string;
  requirePasskeyAttestation: boolean;
  requireHardwarePasskey: boolean;
  allowedPasskeyAaguids: string[];
  deniedPasskeyAaguids: string[];
  ipAllowlist: string[];
  maxSessionAgeSeconds: number;
  idleTimeoutSeconds: number;
  maxConcurrentSessions: number;
  allowedCountries: string[];
}

export interface SaveOrgSecurityPolicyInput {
  requirePasskeyAttestation: boolean;
  requireHardwarePasskey: boolean;
  allowedPasskeyAaguids: string[];
  deniedPasskeyAaguids: string[];
  ipAllowlist: string[];
  maxSessionAgeSeconds: number;
  idleTimeoutSeconds: number;
  maxConcurrentSessions: number;
  allowedCountries: string[];
}

export interface TransferOrganizationInput {
  newOwnerId: string;
}

export interface AcceptInviteInput {
  token: string;
}

export interface AcceptInviteResponse {
  org: Pick<Organization, "id" | "name" | "slug"> | null;
  member: { role: string };
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  totalLogins24h: number;
}

export interface AdminRecentUser {
  id: string;
  name?: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthSettings {
  emailPasswordEnabled: boolean;
  googleOAuthEnabled: boolean;
  githubOAuthEnabled: boolean;
  magicLinkEnabled: boolean;
  passkeyEnabled: boolean;
  totpEnabled: boolean;
  emailOtpEnabled: boolean;
  smsOtpEnabled: boolean;
  requireMfaForAll: boolean;
  sessionTTLSeconds: number;
  maxConcurrentSessions: number;
  accountLockoutEnabled: boolean;
  accountLockoutThreshold: number;
  accountLockoutDurationMinutes: number;
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  allowedEmailDomains: string;
}

export type StatusComponentState = "operational" | "degraded" | "down" | "not set";

export interface StatusData {
  status: "operational" | "degraded" | "down";
  components: Record<string, StatusComponentState>;
  uptimeSeconds: number;
  timestamp: string;
}
