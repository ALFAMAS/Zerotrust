import { lt, and, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { auditLogsTable, sessionsTable, refreshTokensTable, otpsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("data-retention");

export interface RetentionPolicy {
  auditLogRetentionDays: number;
  sessionRetentionDays: number;
  refreshTokenRetentionDays: number;
  otpRetentionDays: number;
}

const DEFAULT_POLICY: RetentionPolicy = {
  auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? "90"),
  sessionRetentionDays: parseInt(process.env.SESSION_RETENTION_DAYS ?? "30"),
  refreshTokenRetentionDays: parseInt(process.env.REFRESH_TOKEN_RETENTION_DAYS ?? "30"),
  otpRetentionDays: parseInt(process.env.OTP_RETENTION_DAYS ?? "7"),
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function purgeOldAuditLogs(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? DEFAULT_POLICY.auditLogRetentionDays;
  const cutoff = daysAgo(days);
  try {
    const db = getDb();
    const result = await db.delete(auditLogsTable).where(lt(auditLogsTable.timestamp, cutoff));
    const count = (result as any).rowCount ?? 0;
    logger.info("Purged old audit logs", { count, cutoffDays: days });
    return count;
  } catch (err) {
    logger.error("Failed to purge audit logs", err as Error);
    return 0;
  }
}

export async function purgeExpiredSessions(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? DEFAULT_POLICY.sessionRetentionDays;
  const cutoff = daysAgo(days);
  try {
    const db = getDb();
    const result = await db
      .delete(sessionsTable)
      .where(and(eq(sessionsTable.isActive, false), lt(sessionsTable.updatedAt, cutoff)));
    const count = (result as any).rowCount ?? 0;
    logger.info("Purged expired sessions", { count, cutoffDays: days });
    return count;
  } catch (err) {
    logger.error("Failed to purge sessions", err as Error);
    return 0;
  }
}

export async function purgeExpiredRefreshTokens(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? DEFAULT_POLICY.refreshTokenRetentionDays;
  const cutoff = daysAgo(days);
  try {
    const db = getDb();
    const result = await db
      .delete(refreshTokensTable)
      .where(
        or(
          lt(refreshTokensTable.expiresAt, new Date()),
          and(eq(refreshTokensTable.isRevoked, true), lt(refreshTokensTable.createdAt, cutoff))
        )
      );
    const count = (result as any).rowCount ?? 0;
    logger.info("Purged expired refresh tokens", { count });
    return count;
  } catch (err) {
    logger.error("Failed to purge refresh tokens", err as Error);
    return 0;
  }
}

export async function purgeExpiredOtps(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? DEFAULT_POLICY.otpRetentionDays;
  const cutoff = daysAgo(days);
  try {
    const db = getDb();
    const result = await db.delete(otpsTable).where(lt(otpsTable.expiresAt, cutoff));
    const count = (result as any).rowCount ?? 0;
    logger.info("Purged expired OTPs", { count, cutoffDays: days });
    return count;
  } catch (err) {
    logger.error("Failed to purge OTPs", err as Error);
    return 0;
  }
}

export async function runRetentionPolicies(policy?: Partial<RetentionPolicy>): Promise<{
  auditLogs: number;
  sessions: number;
  refreshTokens: number;
  otps: number;
}> {
  const [auditLogs, sessions, refreshTokens, otps] = await Promise.all([
    purgeOldAuditLogs(policy?.auditLogRetentionDays),
    purgeExpiredSessions(policy?.sessionRetentionDays),
    purgeExpiredRefreshTokens(policy?.refreshTokenRetentionDays),
    purgeExpiredOtps(policy?.otpRetentionDays),
  ]);

  logger.info("Data retention run complete", { auditLogs, sessions, refreshTokens, otps });
  return { auditLogs, sessions, refreshTokens, otps };
}

// ── Optional: Simple interval-based scheduler ────────────────────────────────

let _retentionInterval: ReturnType<typeof setInterval> | null = null;

export function startRetentionScheduler(intervalHours = 24): void {
  if (_retentionInterval) return;
  const ms = intervalHours * 60 * 60 * 1000;
  _retentionInterval = setInterval(() => {
    runRetentionPolicies().catch((err: Error) => logger.error("Retention policy run failed", err));
  }, ms);
  _retentionInterval.unref();
  logger.info("Data retention scheduler started", { intervalHours });
}

export function stopRetentionScheduler(): void {
  if (_retentionInterval) {
    clearInterval(_retentionInterval);
    _retentionInterval = null;
  }
}
