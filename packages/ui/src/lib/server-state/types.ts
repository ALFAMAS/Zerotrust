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

export type TenantPlan = "free" | "starter" | "pro" | "enterprise";
export type TenantStatus = "active" | "trial" | "suspended" | "deleted";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  displayName?: string;
  status: TenantStatus;
  plan: TenantPlan;
  createdAt?: string;
}

export interface TenantsResponse {
  tenants: Tenant[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface TenantsListParams {
  limit?: number;
  page?: number;
  status?: string;
  plan?: string;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: TenantPlan;
}

export interface UpdateTenantStatusInput {
  id: string;
  status: TenantStatus;
}

export interface ChangeTenantPlanInput {
  id: string;
  plan: TenantPlan;
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
  requestorTenantId: string;
  targetTenantId: string;
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
  targetTenantId: string;
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

export interface ConnectedProviders {
  google?: boolean;
  github?: boolean;
}

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
