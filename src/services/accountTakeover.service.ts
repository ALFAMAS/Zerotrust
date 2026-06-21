/**
 * Account takeover detection.
 * Records sensitive account changes (password reset, email change, MFA
 * disabled) and flags accounts where multiple sensitive changes happen
 * within a short window — the classic takeover pattern is a password
 * reset followed immediately by an email change to lock the owner out.
 *
 * When the pattern fires:
 *  - all sessions except the current one are revoked
 *  - a security alert email is sent to BOTH the old and new address
 *  - the account requires re-authentication
 */

import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { securityEventsTable, sessionsTable } from "../db/schema";
import { auditLog, getLogger } from "../logger";
import { sendSecurityAlertEmail } from "./email.service";

const logger = getLogger("account-takeover");

export type SensitiveChangeType =
  | "password_reset"
  | "email_change"
  | "mfa_disabled"
  | "oauth_unlink";

/** Window in which combined sensitive changes are considered suspicious. */
const TAKEOVER_WINDOW_MS = parseInt(process.env.TAKEOVER_WINDOW_MS ?? String(60 * 60 * 1000), 10);

export interface TakeoverAssessment {
  flagged: boolean;
  recentEvents: SensitiveChangeType[];
}

/** Record a sensitive change. Call from password-reset / email-change flows. */
export async function recordSensitiveChange(
  userId: string,
  type: SensitiveChangeType,
  context?: { ipAddress?: string; userAgent?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const db = getDb();
  await db.insert(securityEventsTable).values({
    userId,
    type,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
    metadata: context?.metadata,
  });
}

/**
 * Assess takeover risk: two or more DIFFERENT sensitive change types within
 * the window is flagged. Returns the assessment without side effects.
 */
export async function assessTakeoverRisk(userId: string): Promise<TakeoverAssessment> {
  const db = getDb();
  const since = new Date(Date.now() - TAKEOVER_WINDOW_MS);

  const events = await db
    .select({ type: securityEventsTable.type })
    .from(securityEventsTable)
    .where(and(eq(securityEventsTable.userId, userId), gt(securityEventsTable.createdAt, since)));

  const types = [...new Set(events.map((e) => e.type as SensitiveChangeType))];
  return { flagged: types.length >= 2, recentEvents: types };
}

/**
 * Record a sensitive change and respond if the takeover pattern fires:
 * revoke all other sessions and alert the account email(s).
 * Returns true when the takeover response was triggered.
 */
export async function recordAndRespond(
  userId: string,
  type: SensitiveChangeType,
  opts: {
    email: string;
    displayName?: string;
    /** Previous email when type = email_change, so the owner is informed. */
    previousEmail?: string;
    currentSessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<boolean> {
  await recordSensitiveChange(userId, type, {
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });

  const assessment = await assessTakeoverRisk(userId);
  if (!assessment.flagged) return false;

  logger.warn("Account takeover pattern detected", {
    userId,
    events: assessment.recentEvents,
  });

  // Revoke every session except the current one (if provided)
  const db = getDb();
  const sessions = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.isActive, true)));

  for (const s of sessions) {
    if (s.id === opts.currentSessionId) continue;
    await db
      .update(sessionsTable)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(sessionsTable.id, s.id));
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const recipients = [...new Set([opts.email, opts.previousEmail].filter(Boolean))] as string[];
  const alert = {
    name: opts.displayName || opts.email,
    action: `Multiple sensitive account changes (${assessment.recentEvents.join(", ")})`,
    device: opts.userAgent || "Unknown device",
    location: opts.ipAddress || "Unknown",
    time: new Date().toUTCString(),
    revokeSessionUrl: `${appUrl}/forgot-password`,
  };
  await Promise.all(recipients.map((to) => sendSecurityAlertEmail(to, alert)));

  await auditLog("security.takeover_flagged", userId, opts.email, true, {
    events: assessment.recentEvents,
    sessionsRevoked: sessions.length - (opts.currentSessionId ? 1 : 0),
  });

  return true;
}
