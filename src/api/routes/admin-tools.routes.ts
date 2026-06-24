/**
 * Admin tools: impersonation, manual plan override, revenue dashboard,
 * broadcast email, CSV exports and feature flag management.
 * Mounted at /admin alongside admin.routes.ts (same guard).
 */

import * as nodeCrypto from "node:crypto";
import { desc, eq, inArray, lt, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../config";
import { getDb } from "../../db";
import {
  auditLogsTable,
  notificationsTable,
  sessionsTable,
  subscriptionsTable,
  usersTable,
} from "../../db/schema";
import { auditLog, getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { sendNotificationEmail } from "../../services/email.service";
import {
  clearFlagCache,
  deleteFlag,
  listFlags,
  upsertFlag,
} from "../../services/featureFlags.service";
import { setLegalHold } from "../../services/legalHold.service";
import { TokenService } from "../../services/token.service";
import { getClientIp } from "../../shared/clientIp";
import { PLAN_CONFIGS, PLANS, type Plan } from "../../shared/plans";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("admin-tools");

// Auth + admin guard on all routes in this module
router.use("*", authMiddleware);
router.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: "UNAUTHORIZED", message: "Authentication required" },
      401,
    );
  }
  if (!user.roles?.includes("admin")) {
    return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
  }
  return next();
});

let tokenServiceInstance: TokenService | null = null;
async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(
    cfg.security.tokenSecretHex,
    cfg.session,
  );
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

// ── POST /admin/users/:id/impersonate ─────────────────────────────────────────
// Creates a short-lived session AS the target user for support purposes.
// Always audit-logged with the admin's identity.
router.post("/users/:id/impersonate", async (c) => {
  try {
    const admin = c.get("user");
    const targetId = c.req.param("id");

    const db = getDb();
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!target) return c.json({ error: "USER_NOT_FOUND" }, 404);
    if (target.roles?.includes("admin")) {
      return c.json(
        { error: "FORBIDDEN", message: "Cannot impersonate another admin" },
        403,
      );
    }

    const tokenSvc = await getTokenService();
    const sessionId = nodeCrypto.randomUUID();

    const accessToken = await tokenSvc.signAccessToken({
      sub: target.id,
      email: target.email,
      sid: sessionId,
      aud: "zerotrust",
      scope: ["openid", "impersonation"],
    });
    const payload = await tokenSvc.verifyAccessToken(accessToken);

    await db.insert(sessionsTable).values({
      id: sessionId,
      userId: target.id,
      tokenId: payload.jti,
      deviceFingerprint: {
        impersonatedBy: admin.id,
        impersonatorEmail: admin.email,
      },
      ipAddress: getClientIp(c) || "admin-console",
      userAgent: `impersonation by ${admin.email}`,
      // Impersonation sessions are deliberately short: 30 minutes
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    });

    await auditLog("admin.impersonate", admin.id, target.id, true, {
      adminEmail: admin.email,
      targetEmail: target.email,
      sessionId,
    });

    return c.json({
      accessToken,
      expiresIn: 30 * 60,
      tokenType: "Bearer",
      impersonating: {
        id: target.id,
        email: target.email,
        displayName: target.displayName,
      },
    });
  } catch (err) {
    logger.error("Impersonation error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── PUT /admin/users/:id/plan ─────────────────────────────────────────────────
// Manual plan override: set plan directly, optionally grant trial days.
router.put("/users/:id/plan", async (c) => {
  try {
    const admin = c.get("user");
    const targetId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const plan = body.plan as Plan;
    const trialDays = parseInt(body.trialDays ?? "0", 10) || 0;

    if (!PLANS.includes(plan)) {
      return c.json(
        { error: "INVALID_REQUEST", message: `plan must be one of ${PLANS}` },
        400,
      );
    }

    const db = getDb();
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!target) return c.json({ error: "USER_NOT_FOUND" }, 404);

    const trialEnd =
      trialDays > 0 ? new Date(Date.now() + trialDays * 86400_000) : null;
    const values = {
      userId: targetId,
      plan,
      status: trialEnd ? "trialing" : "active",
      trialEnd,
      metadata: {
        manualOverride: true,
        overriddenBy: admin.id,
        overriddenAt: new Date(),
      },
    };

    const [sub] = await db
      .insert(subscriptionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    await auditLog("admin.plan_override", admin.id, targetId, true, {
      plan,
      trialDays,
    });

    return c.json({ success: true, subscription: sub });
  } catch (err) {
    logger.error("Plan override error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── GET /admin/revenue ────────────────────────────────────────────────────────
// MRR / ARR / churn / past-due summary from the subscriptions table.
router.get("/revenue", async (c) => {
  try {
    const db = getDb();
    const subs = await db.select().from(subscriptionsTable);

    const billable = subs.filter((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    for (const s of billable) {
      const plan = (s.plan as Plan) in PLAN_CONFIGS ? (s.plan as Plan) : "free";
      byPlan[plan] = (byPlan[plan] ?? 0) + 1;
      mrr += PLAN_CONFIGS[plan].priceMonthly;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const canceledLast30 = subs.filter(
      (s) =>
        s.status === "canceled" && s.canceledAt && s.canceledAt > thirtyDaysAgo,
    ).length;
    const activeStart = billable.length + canceledLast30;
    const churnRate =
      activeStart > 0 ? +((canceledLast30 / activeStart) * 100).toFixed(2) : 0;

    return c.json({
      mrr,
      arr: mrr * 12,
      currency: "usd",
      activeSubscriptions: billable.length,
      byPlan,
      trialing: subs.filter((s) => s.status === "trialing").length,
      pastDue: subs.filter((s) => s.status === "past_due").length,
      canceledLast30Days: canceledLast30,
      churnRatePercent: churnRate,
    });
  } catch (err) {
    logger.error("Revenue dashboard error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── POST /admin/broadcast ─────────────────────────────────────────────────────
// Sends an announcement to all users or a filtered segment, as in-app
// notification + email (email only when sendEmail: true).
router.post("/broadcast", async (c) => {
  try {
    const admin = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { title, message, link } = body;
    const segment = (body.segment as string) || "all"; // all | free | pro | enterprise | inactive
    const sendEmail = body.sendEmail === true;

    if (!title || !message) {
      return c.json(
        { error: "INVALID_REQUEST", message: "title and message required" },
        400,
      );
    }

    const db = getDb();
    let recipients: { id: string; email: string; displayName: string | null }[];

    if (["free", "pro", "enterprise"].includes(segment)) {
      const subs = await db
        .select({ userId: subscriptionsTable.userId })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.plan, segment));
      const ids = subs.map((s) => s.userId).filter(Boolean) as string[];
      if (segment === "free") {
        // Free = no subscription row OR plan=free
        recipients = await db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            displayName: usersTable.displayName,
          })
          .from(usersTable)
          .where(ne(usersTable.status, "deleted"));
        const paidSubs = await db
          .select({ userId: subscriptionsTable.userId })
          .from(subscriptionsTable)
          .where(ne(subscriptionsTable.plan, "free"));
        const paidIds = new Set(paidSubs.map((s) => s.userId).filter(Boolean));
        recipients = recipients.filter((r) => !paidIds.has(r.id));
      } else {
        recipients = ids.length
          ? await db
              .select({
                id: usersTable.id,
                email: usersTable.email,
                displayName: usersTable.displayName,
              })
              .from(usersTable)
              .where(inArray(usersTable.id, ids))
          : [];
      }
    } else if (segment === "inactive") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
      recipients = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
        })
        .from(usersTable)
        .where(lt(usersTable.lastLoginAt, thirtyDaysAgo));
    } else {
      recipients = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
        })
        .from(usersTable)
        .where(ne(usersTable.status, "deleted"));
    }

    // In-app notification for everyone in the segment
    if (recipients.length > 0) {
      await db.insert(notificationsTable).values(
        recipients.map((r) => ({
          userId: r.id,
          type: "announcement",
          title,
          body: message,
          link: link ?? null,
        })),
      );
    }

    // Optional email fan-out — sequential to stay friendly to SMTP limits
    if (sendEmail) {
      for (const r of recipients) {
        void sendNotificationEmail(r.email, {
          name: r.displayName ?? r.email,
          title,
          body: message,
          link,
        });
      }
    }

    await auditLog("admin.broadcast", admin.id, segment, true, {
      title,
      recipients: recipients.length,
      sendEmail,
    });

    return c.json({ success: true, recipients: recipients.length });
  } catch (err) {
    logger.error("Broadcast error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── CSV exports ───────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escapeCsv = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(",")),
  ].join("\n");
}

// GET /admin/users/export — CSV of all users
router.get("/users/export", async (c) => {
  try {
    const db = getDb();
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        roles: usersTable.roles,
        status: usersTable.status,
        lastLoginAt: usersTable.lastLoginAt,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(ne(usersTable.status, "deleted"));

    const csv = toCsv(
      users.map((u) => ({
        ...u,
        roles: u.roles?.join("|"),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? "",
        createdAt: u.createdAt.toISOString(),
      })),
    );

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="users-${Date.now()}.csv"`,
    );
    return c.body(csv);
  } catch (err) {
    logger.error("User export error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /admin/audit/export?limit=10000 — CSV of recent audit log entries
router.get("/audit/export", async (c) => {
  try {
    const limit = Math.min(
      50_000,
      parseInt(c.req.query("limit") || "10000", 10),
    );
    const db = getDb();
    const rows = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit);

    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        timestamp: r.timestamp?.toISOString?.() ?? r.timestamp,
        resourceDetails: r.resourceDetails
          ? JSON.stringify(r.resourceDetails)
          : "",
        continuousEvalContext: r.continuousEvalContext
          ? JSON.stringify(r.continuousEvalContext)
          : "",
        metadata: r.metadata ? JSON.stringify(r.metadata) : "",
      })),
    );

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="audit-${Date.now()}.csv"`,
    );
    return c.body(csv);
  } catch (err) {
    logger.error("Audit export error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Feature flags admin CRUD ──────────────────────────────────────────────────

// GET /admin/feature-flags
router.get("/feature-flags", async (c) => {
  const flags = await listFlags();
  return c.json({ flags });
});

// PUT /admin/feature-flags/:key
router.put("/feature-flags/:key", async (c) => {
  try {
    const admin = c.get("user");
    const key = c.req.param("key");
    const body = await c.req.json().catch(() => ({}));
    const flag = await upsertFlag({
      key,
      description: body.description,
      enabled: body.enabled,
      enabledForUsers: body.enabledForUsers,
      rolloutPercent: body.rolloutPercent,
    });
    await auditLog("admin.feature_flag_updated", admin.id, key, true, {
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
    });
    return c.json(flag);
  } catch (err) {
    logger.error("Feature flag upsert error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /admin/feature-flags/:key
router.delete("/feature-flags/:key", async (c) => {
  const key = c.req.param("key");
  const ok = await deleteFlag(key);
  clearFlagCache();
  return ok ? c.json({ success: true }) : c.json({ error: "NOT_FOUND" }, 404);
});

// POST /users/:id/legal-hold — place or lift a legal hold (admin only)
router.post("/users/:id/legal-hold", async (c) => {
  const id = c.req.param("id");
  const admin = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as {
    hold?: boolean;
    reason?: string;
  };
  if (typeof body.hold !== "boolean") {
    return c.json(
      { error: "INVALID_REQUEST", message: "hold (boolean) is required" },
      400,
    );
  }

  const ok = await setLegalHold(id, body.hold, {
    reason: body.reason,
    by: admin.id,
  });
  if (!ok)
    return c.json({ error: "NOT_FOUND", message: "User not found" }, 404);

  void auditLog(
    body.hold ? "admin.legal_hold.placed" : "admin.legal_hold.lifted",
    admin.id,
    id,
    true,
    { reason: body.reason },
  );
  return c.json({ success: true, userId: id, legalHold: body.hold });
});

export default router;
