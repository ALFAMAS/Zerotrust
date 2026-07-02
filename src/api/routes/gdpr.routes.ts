import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../db";
import {
  auditLogsTable,
  organizationMembersTable,
  sessionsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import type { HonoEnv, User } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("gdpr");

// ── GDPR Data Export ──────────────────────────────────────────────────────────

router.get("/export", rateLimit({ points: 3, windowSecs: 3600 }), authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getReadDb();

  try {
    const [profile] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

    if (!profile) return c.json({ error: "USER_NOT_FOUND" }, 404);

    const sessions = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, user.id))
      .orderBy(desc(sessionsTable.createdAt));

    const auditLogs = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.actorId, user.id))
      .orderBy(desc(auditLogsTable.timestamp));

    const memberships = await db
      .select()
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.userId, user.id));

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
    const pending = await db.select().from(usersTable);
    for (const u of pending) {
      const meta = (u.metadata as Record<string, unknown>) ?? {};
      const scheduledFor = meta.deletionScheduledFor as string | undefined;
      if (!scheduledFor || new Date(scheduledFor) > now) continue;

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
