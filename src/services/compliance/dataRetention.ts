import { and, eq, lt, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "../../db/index";
import {
  auditLogsTable,
  otpsTable,
  refreshTokensTable,
  sessionsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger/index";
import { getHeldUserIds } from "./legalHold.service";

const logger = getLogger("data-retention");

export interface RetentionPolicy {
  auditLogRetentionDays: number;
  sessionRetentionDays: number;
  refreshTokenRetentionDays: number;
  otpRetentionDays: number;
}

const DEFAULT_POLICY: RetentionPolicy = {
  auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? "90", 10),
  sessionRetentionDays: parseInt(process.env.SESSION_RETENTION_DAYS ?? "30", 10),
  refreshTokenRetentionDays: parseInt(process.env.REFRESH_TOKEN_RETENTION_DAYS ?? "30", 10),
  otpRetentionDays: parseInt(process.env.OTP_RETENTION_DAYS ?? "7", 10),
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function purgeOldAuditLogs(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? DEFAULT_POLICY.auditLogRetentionDays;
  const cutoff = daysAgo(days);
  try {
    const db = getDb();
    // Accounts under legal hold keep their audit trail regardless of age.
    const heldUserIds = await getHeldUserIds();
    const where =
      heldUserIds.length > 0
        ? and(lt(auditLogsTable.timestamp, cutoff), notInArray(auditLogsTable.actorId, heldUserIds))
        : lt(auditLogsTable.timestamp, cutoff);
    const result = await db.delete(auditLogsTable).where(where);
    const count = (result as { count?: number }).count ?? 0;
    logger.info("Purged old audit logs", {
      count,
      cutoffDays: days,
      legalHolds: heldUserIds.length,
    });
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
    const count = (result as { count?: number }).count ?? 0;
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
    const count = (result as { count?: number }).count ?? 0;
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
    const count = (result as { count?: number }).count ?? 0;
    logger.info("Purged expired OTPs", { count, cutoffDays: days });
    return count;
  } catch (err) {
    logger.error("Failed to purge OTPs", err as Error);
    return 0;
  }
}

/**
 * Purge PII for accounts whose 30-day GDPR deletion grace period (set by
 * `DELETE /gdpr/account`) has elapsed. Query-level filter: only rows with a
 * due deletion schedule that are NOT under legal hold are even loaded —
 * `legalHold` exists specifically to exempt an account from this purge (e.g.
 * active audit/legal defensibility). A previous version of this function
 * loaded every user row with no WHERE clause at all and never checked
 * legalHold; it was also never wired into the scheduled retention run, so
 * the "your data will be permanently deleted in 30 days" promise made by
 * the GDPR deletion-request endpoint was never actually fulfilled.
 */
export async function purgeScheduledDeletions(): Promise<number> {
  const db = getDb();
  const now = new Date();
  let purged = 0;

  try {
    const pending = await db
      .select({ id: usersTable.id, legalHold: usersTable.legalHold })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.legalHold, false),
          sql`${usersTable.metadata} ->> 'deletionScheduledFor' IS NOT NULL`,
          sql`(${usersTable.metadata} ->> 'deletionScheduledFor')::timestamptz <= ${now}`
        )
      );

    for (const u of pending) {
      // Defense in depth: even if the query-level filter above is ever
      // weakened or bypassed, a legal-hold account must never be purged.
      if (u.legalHold) {
        logger.warn("Skipped purge of legal-hold user", { userId: u.id });
        continue;
      }

      await db
        .update(usersTable)
        .set({
          email: `deleted-${u.id}@deleted.invalid`,
          username: null,
          displayName: "Deleted User",
          passwordHash: null,
          phone: null,
          avatarUrl: null,
          attributes: {},
          metadata: { purgedAt: now.toISOString() },
          status: "deleted",
          updatedAt: now,
        })
        .where(eq(usersTable.id, u.id));

      purged++;
      logger.info("User PII purged", { userId: u.id });
    }
  } catch (err) {
    logger.error("Purge scheduled deletions failed", err as Error);
  }

  return purged;
}

export async function runRetentionPolicies(policy?: Partial<RetentionPolicy>): Promise<{
  auditLogs: number;
  sessions: number;
  refreshTokens: number;
  otps: number;
  gdprDeletions: number;
}> {
  const [auditLogs, sessions, refreshTokens, otps, gdprDeletions] = await Promise.all([
    purgeOldAuditLogs(policy?.auditLogRetentionDays),
    purgeExpiredSessions(policy?.sessionRetentionDays),
    purgeExpiredRefreshTokens(policy?.refreshTokenRetentionDays),
    purgeExpiredOtps(policy?.otpRetentionDays),
    purgeScheduledDeletions(),
  ]);

  logger.info("Data retention run complete", {
    auditLogs,
    sessions,
    refreshTokens,
    otps,
    gdprDeletions,
  });
  return { auditLogs, sessions, refreshTokens, otps, gdprDeletions };
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
