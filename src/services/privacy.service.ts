// ── Privacy records (ROPA, consent receipts, DPA) ───────────────────────────

export type PrivacyRecordType =
  | "ropa"
  | "consent"
  | "dpa"
  | "data_request"
  | "breach_notification";

export interface PrivacyRecord {
  id: string;
  orgId: string;
  type: PrivacyRecordType;
  title: string;
  description: string;
  createdAt: string;
  /** For consent records: the user who consented. For ROPA: the data subject category. */
  subject?: string;
  /** Legal basis (GDPR Art. 6) — "consent", "contract", "legal_obligation", etc. */
  legalBasis?: string;
  /** Retention period in days. */
  retentionDays?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a Records of Processing Activities (ROPA) document for an org.
 * ROPA is required under GDPR Art. 30 — it documents what personal data
 * is processed, why, how long it's kept, and who has access.
 */
export function generateRopa(orgId: string, orgName: string): PrivacyRecord {
  const now = new Date().toISOString();
  return {
    id: `ropa-${orgId}-${Date.now()}`,
    orgId,
    type: "ropa",
    title: `ROPA — ${orgName}`,
    description: `Records of Processing Activities for ${orgName}`,
    createdAt: now,
    metadata: {
      processingActivities: [
        {
          purpose: "Authentication",
          dataCategories: ["email", "password_hash", "ip"],
          legalBasis: "contract",
          retentionDays: 365,
        },
        {
          purpose: "Multi-factor auth",
          dataCategories: ["phone", "totp_secret"],
          legalBasis: "contract",
          retentionDays: 365,
        },
        {
          purpose: "Session management",
          dataCategories: ["ip", "user_agent", "session_token"],
          legalBasis: "contract",
          retentionDays: 30,
        },
        {
          purpose: "Security audit",
          dataCategories: ["action", "ip", "timestamp"],
          legalBasis: "legal_obligation",
          retentionDays: 730,
        },
        {
          purpose: "Email delivery",
          dataCategories: ["email", "name"],
          legalBasis: "contract",
          retentionDays: 365,
        },
        {
          purpose: "Analytics",
          dataCategories: ["feature_usage", "login_timestamp"],
          legalBasis: "legitimate_interest",
          retentionDays: 365,
        },
      ],
      dataProtectionOfficer: process.env.DPO_EMAIL || "dpo@example.com",
      lastReviewedAt: now,
    },
  };
}

/** Generate a consent receipt (GDPR Art. 7 — demonstrable consent). */
export function generateConsentReceipt(
  orgId: string,
  userId: string,
  purpose: string,
  legalBasis: string,
): PrivacyRecord {
  return {
    id: `consent-${orgId}-${userId}-${Date.now()}`,
    orgId,
    type: "consent",
    title: `Consent: ${purpose}`,
    description: `User ${userId} consented to: ${purpose}`,
    createdAt: new Date().toISOString(),
    subject: userId,
    legalBasis,
    metadata: {
      purpose,
      withdrawn: false,
      consentVersion: "1.0",
    },
  };
}

/** Generate a Data Processing Agreement template. */
export function generateDpa(orgId: string, orgName: string): PrivacyRecord {
  return {
    id: `dpa-${orgId}-${Date.now()}`,
    orgId,
    type: "dpa",
    title: `DPA — ${orgName}`,
    description: `Data Processing Agreement for ${orgName}`,
    createdAt: new Date().toISOString(),
    metadata: {
      processor: process.env.APP_NAME || "zerotrust",
      subprocessors: ["PostgreSQL (AWS)", "Redis (AWS)", "S3 (AWS)"],
      dataCategories: ["authentication", "security_logs", "user_profile"],
      retentionPolicy:
        "Data retained per service terms; deleted within 30 days of account termination",
      breachNotificationHours: 72,
      lastReviewedAt: new Date().toISOString(),
    },
  };
}

/** Generate a SAR (Subject Access Request) record. */
export function generateDataRequest(
  orgId: string,
  userId: string,
  requestType: "access" | "deletion" | "portability",
): PrivacyRecord {
  return {
    id: `sar-${orgId}-${userId}-${Date.now()}`,
    orgId,
    type: "data_request",
    title: `SAR: ${requestType} for ${userId}`,
    description: `Data subject ${requestType} request received`,
    createdAt: new Date().toISOString(),
    subject: userId,
    metadata: {
      requestType,
      status: "pending",
      deadlineDays: 30,
    },
  };
}

export function privacyProvider(): "database" | "file" {
  return "database";
}
