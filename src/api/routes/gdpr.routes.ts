import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../db";
import {
  auditLogsTable,
  feedbackTable,
  notificationsTable,
  organizationMembersTable,
  sessionsTable,
  supportTicketMessagesTable,
  supportTicketsTable,
  usersTable,
  walletTransactionsTable,
  walletsTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import type { HonoEnv, Passkey, User } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("gdpr");

function exportPasskeyMetadata(passkeys: Passkey[] | null | undefined) {
  return (passkeys ?? []).map((pk) => ({
    credentialId: pk.credentialId,
    name: pk.name,
    deviceType: pk.deviceType,
    backedUp: pk.backedUp,
    transports: pk.transports,
    aaguid: pk.aaguid,
    attestationFormat: pk.attestationFormat,
    counter: pk.counter,
    createdAt: pk.createdAt,
    lastUsedAt: pk.lastUsedAt,
    orgId: pk.orgId,
  }));
}

// ── GDPR Data Export ──────────────────────────────────────────────────────────

router.get("/export", rateLimit({ points: 3, windowSecs: 3600 }), authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getReadDb();

  try {
    const [profile] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

    if (!profile) return c.json({ error: "USER_NOT_FOUND" }, 404);

    const [
      sessions,
      auditLogs,
      memberships,
      wallet,
      walletTransactions,
      supportTickets,
      feedback,
      notifications,
    ] = await Promise.all([
      db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, user.id))
        .orderBy(desc(sessionsTable.createdAt)),
      db
        .select()
        .from(auditLogsTable)
        .where(
          or(eq(auditLogsTable.actorId, user.id), eq(auditLogsTable.targetId, user.id))
        )
        .orderBy(desc(auditLogsTable.timestamp)),
      db
        .select()
        .from(organizationMembersTable)
        .where(eq(organizationMembersTable.userId, user.id)),
      db.select().from(walletsTable).where(eq(walletsTable.userId, user.id)).limit(1),
      db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, user.id))
        .orderBy(desc(walletTransactionsTable.createdAt)),
      db
        .select()
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.userId, user.id))
        .orderBy(desc(supportTicketsTable.createdAt)),
      db
        .select()
        .from(feedbackTable)
        .where(eq(feedbackTable.userId, user.id))
        .orderBy(desc(feedbackTable.createdAt)),
      db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, user.id))
        .orderBy(desc(notificationsTable.createdAt)),
    ]);

    const ticketIds = supportTickets.map((t) => t.id);
    const supportMessages =
      ticketIds.length > 0
        ? await db
            .select()
            .from(supportTicketMessagesTable)
            .where(inArray(supportTicketMessagesTable.ticketId, ticketIds))
            .orderBy(desc(supportTicketMessagesTable.createdAt))
        : [];

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        displayName: profile.displayName,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        roles: profile.roles,
        attributes: profile.attributes,
        status: profile.status,
        createdAt: profile.createdAt,
        lastLoginAt: profile.lastLoginAt,
        sessionConfig: profile.sessionConfig,
        mfa: {
          totp: { enabled: (profile.mfa as User["mfa"] | null)?.totp?.enabled },
          webauthn: { enabled: (profile.mfa as User["mfa"] | null)?.webauthn?.enabled },
        },
        passkeys: exportPasskeyMetadata(profile.passkeys as Passkey[] | null),
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        country: s.country,
        userAgent: s.userAgent,
        isActive: s.isActive,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastActivityAt: s.lastActivityAt,
      })),
      auditLogs: auditLogs.map((log) => ({
        action: log.action,
        actorId: log.actorId,
        targetId: log.targetId,
        targetType: log.targetType,
        ipAddress: log.ipAddress,
        country: log.country,
        success: log.success,
        timestamp: log.timestamp,
      })),
      organizations: memberships.map((m) => ({
        orgId: m.orgId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      wallet: wallet[0]
        ? {
            balance: wallet[0].balance,
            lifetimeBalance: wallet[0].lifetimeBalance,
            currency: wallet[0].currency,
            autoTopUp: wallet[0].autoTopUp,
            autoTopUpThreshold: wallet[0].autoTopUpThreshold,
            autoTopUpAmount: wallet[0].autoTopUpAmount,
            createdAt: wallet[0].createdAt,
            updatedAt: wallet[0].updatedAt,
          }
        : null,
      walletTransactions: walletTransactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
      supportTickets: supportTickets.map((t) => ({
        id: t.id,
        orgId: t.orgId,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messages: supportMessages
          .filter((m) => m.ticketId === t.id)
          .map((m) => ({
            id: m.id,
            authorId: m.authorId,
            authorRole: m.authorRole,
            body: m.body,
            createdAt: m.createdAt,
          })),
      })),
      feedback: feedback.map((f) => ({
        id: f.id,
        orgId: f.orgId,
        type: f.type,
        score: f.score,
        comment: f.comment,
        context: f.context,
        metadata: f.metadata,
        createdAt: f.createdAt,
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };

    logger.info("GDPR data export", { userId: user.id });

    c.header("Content-Disposition", `attachment; filename="data-export-${user.id}.json"`);
    c.header("Content-Type", "application/json");
    return c.json(exportData);
  } catch (err) {
    logger.error("GDPR export failed", err as Error);
    return c.json({ error: "EXPORT_FAILED" }, 500);
  }
});

// ── Account Deletion Request ─────────────────────────────────────────────────

router.delete("/account", rateLimit({ points: 3, windowSecs: 3600 }), authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();

  try {
    const [profile] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

    if (!profile) return c.json({ error: "USER_NOT_FOUND" }, 404);

    const existingMeta = (profile.metadata as Record<string, unknown>) ?? {};
    if (existingMeta.deletionRequestedAt) {
      return c.json(
        {
          error: "DELETION_ALREADY_REQUESTED",
          scheduledFor: existingMeta.deletionScheduledFor,
        },
        409
      );
    }

    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(usersTable)
      .set({
        metadata: {
          ...existingMeta,
          deletionRequestedAt: now.toISOString(),
          deletionScheduledFor: scheduledFor.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(usersTable.id, user.id));

    // Revoke all active sessions immediately
    await db
      .update(sessionsTable)
      .set({ isActive: false, revokedAt: now, revokedReason: "account_deletion_requested" })
      .where(and(eq(sessionsTable.userId, user.id), eq(sessionsTable.isActive, true)));

    logger.info("Account deletion requested", { userId: user.id, scheduledFor });

    return c.json({
      message: "Account deletion scheduled. Your data will be permanently deleted in 30 days.",
      scheduledFor: scheduledFor.toISOString(),
      cancelUrl: "/account/deletion/cancel",
    });
  } catch (err) {
    logger.error("Account deletion request failed", err as Error);
    return c.json({ error: "DELETION_REQUEST_FAILED" }, 500);
  }
});

// ── Cancel Deletion Request ───────────────────────────────────────────────────

router.post(
  "/account/deletion/cancel",
  rateLimit({ points: 5, windowSecs: 3600 }),
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    const db = getDb();

    try {
      const [profile] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      if (!profile) return c.json({ error: "USER_NOT_FOUND" }, 404);

      const existingMeta = (profile.metadata as Record<string, unknown>) ?? {};
      if (!existingMeta.deletionRequestedAt) {
        return c.json({ error: "NO_DELETION_PENDING" }, 400);
      }

      const { deletionRequestedAt: _a, deletionScheduledFor: _b, ...restMeta } = existingMeta;

      await db
        .update(usersTable)
        .set({ metadata: restMeta, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));

      logger.info("Account deletion cancelled", { userId: user.id });

      return c.json({ message: "Account deletion cancelled successfully." });
    } catch (err) {
      logger.error("Cancel deletion failed", err as Error);
      return c.json({ error: "CANCEL_FAILED" }, 500);
    }
  }
);

// ── Purge Expired Deletions (called by cron/scheduler) ───────────────────────

export async function purgeScheduledDeletions(): Promise<number> {
  const db = getDb();
  const now = new Date();
  let purged = 0;

  try {
    // Target only users past their scheduled deletion date — not a full-table
    // scan. Accounts on legal hold are exempt (spoliation/compliance).
    const pending = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.legalHold, false),
          sql`${usersTable.metadata}->>'deletionScheduledFor' IS NOT NULL`,
          sql`(${usersTable.metadata}->>'deletionScheduledFor')::timestamptz <= ${now.toISOString()}::timestamptz`
        )
      );

    for (const u of pending) {
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

export default router;
