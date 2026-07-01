import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { riskAssessmentsTable, soc2ControlsTable } from "../db/schema";

// ── SOC 2 controls ────────────────────────────────────────────────────────────

export interface Soc2Control {
  controlId: string;
  category: string;
  title: string;
  description?: string;
  implementation: string;
  evidence?: string;
  status: "implemented" | "partial" | "planned";
  lastReviewedAt?: Date;
  reviewedBy?: string;
}

export async function seedSoc2Controls(): Promise<void> {
  const db = getDb();
  const controls: Omit<Soc2Control, "id">[] = [
    {
      controlId: "CC6.1",
      category: "CC6",
      title: "Logical access controls",
      description: "Multi-factor authentication, RBAC, API key scoping",
      implementation:
        "MFA (TOTP, passkeys, email OTP), RBAC+ABAC, per-key scopes enforced in apiKeyAuth middleware",
      evidence: "src/middleware/auth.ts, src/middleware/apiKeyAuth.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.2",
      category: "CC6",
      title: "User authentication",
      description: "Strong authentication with breach detection",
      implementation:
        "PASETO v4 tokens, HIBP breach check, anomaly detection, account lockout, disposable-email blocking",
      evidence: "src/services/anomaly.service.ts, src/middleware/auth.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.3",
      category: "CC6",
      title: "Network security",
      description: "Rate limiting, CSRF protection, IP allowlists",
      implementation:
        "Per-IP sliding window rate limiting (Redis + in-memory fallback), CSRF tokens, per-org IP allowlists via cidr matcher",
      evidence: "src/middleware/rateLimiting.ts, src/middleware/cidr.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.4",
      category: "CC6",
      title: "Data encryption at rest",
      description: "Sensitive fields encrypted with CSFLE",
      implementation:
        "CSFLEManager with key versioning, AES-256-GCM field-level encryption for PII",
      evidence: "src/services/csfle.service.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.5",
      category: "CC6",
      title: "Data encryption in transit",
      description: "TLS enforced on all connections",
      implementation: "Hono secure-headers middleware, HTTPS enforced at load balancer",
      evidence: "src/middleware/secureHeaders.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.6",
      category: "CC6",
      title: "System monitoring",
      description: "Prometheus metrics, structured logging, audit trail",
      implementation:
        "Prometheus /metrics, OpenTelemetry tracing, Elasticsearch audit log fan-out, Sentry error tracking",
      evidence: "src/instrument.ts, src/audit/index.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.7",
      category: "CC6",
      title: "Change management",
      description: "Version-controlled infrastructure, CI/CD pipeline",
      implementation:
        "GitHub Actions CI (lint+typecheck+test+build), semantic-release, API versioning",
      evidence: ".github/workflows/ci.yml, src/middleware/apiVersioning.ts",
      status: "implemented",
    },
    {
      controlId: "CC6.8",
      category: "CC6",
      title: "Vulnerability management",
      description: "Dependency scanning, security headers",
      implementation: "HIBP check, rate limiting, secure headers, CSP, HSTS",
      evidence: "src/middleware/secureHeaders.ts",
      status: "implemented",
    },
    {
      controlId: "A1.1",
      category: "A1",
      title: "Availability SLO",
      description: "99.9% availability target with error budget tracking",
      implementation: "SLO dashboard (slo.service.ts), burn-rate alerts via Slack/Teams/PagerDuty",
      evidence: "src/services/slo.service.ts",
      status: "implemented",
    },
    {
      controlId: "A1.2",
      category: "A1",
      title: "Disaster recovery",
      description: "Daily backups, PITR capability",
      implementation: "pg_dump daily backups with 30-day retention, S3 upload, Neon PITR",
      evidence: "src/services/dbBackup.service.ts",
      status: "implemented",
    },
    {
      controlId: "A1.3",
      category: "A1",
      title: "Incident response",
      description: "Alerting, on-call rotation, incident tracking",
      implementation: "Burn-rate alerts, SLO monitoring, anomaly detection alerts",
      evidence: "src/services/alerting.service.ts",
      status: "implemented",
    },
    {
      controlId: "C1.1",
      category: "C1",
      title: "Data retention",
      description: "Configurable retention policies with auto-purge",
      implementation:
        "Data retention scheduler purges audit logs, sessions, OTPs after configurable intervals",
      evidence: "src/services/dataRetention",
      status: "implemented",
    },
    {
      controlId: "C1.2",
      category: "C1",
      title: "Privacy compliance",
      description: "GDPR data export, account deletion, consent management",
      implementation:
        "GDPR data export endpoint, 30-day soft-delete, cookie consent banner, CAN-SPAM unsubscribe",
      evidence: "src/api/routes/gdpr.routes.ts",
      status: "implemented",
    },
    {
      controlId: "P1.1",
      category: "P",
      title: "Access reviews",
      description: "Periodic privilege reviews with evidence",
      implementation: "Admin access review snapshots, approve/flag/revoke decisions retained",
      evidence: "src/api/routes/access-review.routes.ts",
      status: "implemented",
    },
  ];

  for (const ctrl of controls) {
    await db.insert(soc2ControlsTable).values(ctrl).onConflictDoNothing();
  }
}

export async function getSoc2Controls(): Promise<Soc2Control[]> {
  const db = getDb();
  await seedSoc2Controls();
  const rows = await db.select().from(soc2ControlsTable).orderBy(soc2ControlsTable.controlId);
  return rows.map((r) => ({
    controlId: r.controlId,
    category: r.category,
    title: r.title,
    description: r.description ?? undefined,
    implementation: r.implementation,
    evidence: r.evidence ?? undefined,
    status: r.status as Soc2Control["status"],
    lastReviewedAt: r.lastReviewedAt ?? undefined,
    reviewedBy: r.reviewedBy ?? undefined,
  }));
}

export async function getSoc2Readiness(): Promise<{
  total: number;
  implemented: number;
  partial: number;
  planned: number;
  readinessPercent: number;
}> {
  const controls = await getSoc2Controls();
  const implemented = controls.filter((c) => c.status === "implemented").length;
  const partial = controls.filter((c) => c.status === "partial").length;
  const planned = controls.filter((c) => c.status === "planned").length;
  const readinessPercent = Math.round(((implemented + partial * 0.5) / controls.length) * 100);
  return { total: controls.length, implemented, partial, planned, readinessPercent };
}

export async function updateSoc2Control(
  controlId: string,
  updates: Partial<Pick<Soc2Control, "status" | "implementation" | "evidence" | "reviewedBy">>
): Promise<void> {
  const db = getDb();
  await db
    .update(soc2ControlsTable)
    .set({ ...updates, lastReviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(soc2ControlsTable.controlId, controlId));
}

// ── Risk assessment ───────────────────────────────────────────────────────────

export interface RiskItem {
  year: number;
  riskId: string;
  category: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  treatment: "mitigate" | "accept" | "transfer" | "avoid";
  mitigation: string;
  owner: string;
  status: "open" | "mitigated" | "closed";
}

export async function seedRiskAssessment(year: number): Promise<void> {
  const db = getDb();
  const risks: Omit<RiskItem, "id">[] = [
    {
      year,
      riskId: "R-001",
      category: "security",
      title: "Credential stuffing attack",
      description: "Automated bot attempts using leaked credentials",
      likelihood: 4,
      impact: 3,
      riskScore: 12,
      treatment: "mitigate",
      mitigation: "Per-IP rate limiting, account lockout, HIBP breach check, anomaly detection",
      owner: "security-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-002",
      category: "security",
      title: "Token theft",
      description: "PASETO tokens stolen via XSS or MITM",
      likelihood: 2,
      impact: 5,
      riskScore: 10,
      treatment: "mitigate",
      mitigation: "1-hour token TTL, SHA-256 hashed refresh tokens, secure headers, CSP",
      owner: "security-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-003",
      category: "availability",
      title: "Database outage",
      description: "PostgreSQL connection exhaustion or primary failure",
      likelihood: 2,
      impact: 5,
      riskScore: 10,
      treatment: "mitigate",
      mitigation: "Read replicas, connection pooling, PITR, daily backups",
      owner: "platform-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-004",
      category: "availability",
      title: "Redis unavailability",
      description: "Cache/session store down",
      likelihood: 3,
      impact: 3,
      riskScore: 9,
      treatment: "mitigate",
      mitigation: "In-memory fallback for rate limiting, session cache debounce",
      owner: "platform-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-005",
      category: "compliance",
      title: "GDPR data breach",
      description: "Unauthorized access to EU user PII",
      likelihood: 2,
      impact: 5,
      riskScore: 10,
      treatment: "mitigate",
      mitigation: "CSFLE field encryption, data residency controls, access reviews, audit logging",
      owner: "dpo",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-006",
      category: "compliance",
      title: "Data residency violation",
      description: "EU data stored in US region",
      likelihood: 2,
      impact: 4,
      riskScore: 8,
      treatment: "mitigate",
      mitigation: "Per-org storageRegion, geo-routing middleware, canAccessRegion enforcement",
      owner: "dpo",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-007",
      category: "financial",
      title: "Stripe webhook failure",
      description: "Payment events not processed",
      likelihood: 2,
      impact: 4,
      riskScore: 8,
      treatment: "mitigate",
      mitigation: "Webhook retry with backoff, billing lifecycle scheduler reconciliation",
      owner: "billing-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-008",
      category: "security",
      title: "Insider threat",
      description: "Admin abuse of impersonation or data access",
      likelihood: 2,
      impact: 4,
      riskScore: 8,
      treatment: "mitigate",
      mitigation: "Admin role checks, audit log, 30-min impersonation TTL, access reviews",
      owner: "security-team",
      status: "mitigated",
    },
    {
      year,
      riskId: "R-009",
      category: "security",
      title: "Referral fraud",
      description: "Self-referrals, same-IP abuse",
      likelihood: 3,
      impact: 2,
      riskScore: 6,
      treatment: "mitigate",
      mitigation: "Same-IP detection, referredBy validation, fraud detection service",
      owner: "growth-team",
      status: "open",
    },
    {
      year,
      riskId: "R-010",
      category: "availability",
      title: "Email delivery failure",
      description: "Transactional emails not reaching users",
      likelihood: 2,
      impact: 3,
      riskScore: 6,
      treatment: "mitigate",
      mitigation: "BullMQ email queue with retry, suppression list, bounce/complaint handling",
      owner: "platform-team",
      status: "mitigated",
    },
  ];

  for (const risk of risks) {
    await db.insert(riskAssessmentsTable).values(risk).onConflictDoNothing();
  }
}

export async function getRiskAssessment(year: number): Promise<{
  year: number;
  totalRisks: number;
  openRisks: number;
  mitigatedRisks: number;
  closedRisks: number;
  avgRiskScore: number;
  risks: RiskItem[];
}> {
  const db = getDb();
  await seedRiskAssessment(year);
  const rows = await db
    .select()
    .from(riskAssessmentsTable)
    .where(eq(riskAssessmentsTable.year, year))
    .orderBy(sql`${riskAssessmentsTable.riskScore} DESC`);

  const risks: RiskItem[] = rows.map((r) => ({
    year: r.year,
    riskId: r.riskId,
    category: r.category,
    title: r.title,
    description: r.description ?? "",
    likelihood: r.likelihood,
    impact: r.impact,
    riskScore: r.riskScore,
    treatment: r.treatment as RiskItem["treatment"],
    mitigation: r.mitigation ?? "",
    owner: r.owner ?? "",
    status: r.status as RiskItem["status"],
  }));

  const open = risks.filter((r) => r.status === "open").length;
  const mitigated = risks.filter((r) => r.status === "mitigated").length;
  const closed = risks.filter((r) => r.status === "closed").length;
  const avgScore =
    risks.length > 0 ? Math.round(risks.reduce((s, r) => s + r.riskScore, 0) / risks.length) : 0;

  return {
    year,
    totalRisks: risks.length,
    openRisks: open,
    mitigatedRisks: mitigated,
    closedRisks: closed,
    avgRiskScore: avgScore,
    risks,
  };
}

export async function addRiskAssessment(risk: Omit<RiskItem, "id">): Promise<void> {
  const db = getDb();
  await db.insert(riskAssessmentsTable).values(risk);
}

export async function updateRiskStatus(
  year: number,
  riskId: string,
  status: "open" | "mitigated" | "closed"
): Promise<void> {
  const db = getDb();
  await db
    .update(riskAssessmentsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(riskAssessmentsTable.year, year), eq(riskAssessmentsTable.riskId, riskId)));
}
