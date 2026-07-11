/**
 * Admin tools: impersonation, manual plan override, revenue dashboard,
 * broadcast email and CSV exports.
 * Mounted at /admin alongside admin.routes.ts (same guard).
 */

import * as nodeCrypto from "node:crypto";
import { desc, eq, inArray, lt, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../config";
import { getDb, getReadDb } from "../../db";
import { createImpersonationSession } from "../../db/repositories/authSessions.repository";
import {
  auditLogsTable,
  notificationsTable,
  subscriptionsTable,
  usersTable,
} from "../../db/schema";
import { auditLog, getLogger } from "../../logger";
import { authMiddleware, requireAdmin } from "../../middleware/auth";
import { TokenService } from "../../services/auth/token.service";
import { setLegalHold } from "../../services/compliance/legalHold.service";
import { sendNotificationEmail } from "../../services/notifications/email.service";
import { enqueueEmail } from "../../services/notifications/emailQueue";
import { getClientIp } from "../../shared/clientIp";
import { internalError } from "../../shared/httpErrors";
import { PLAN_CONFIGS, PLANS, type Plan } from "../../shared/plans";
import { hasRole } from "../../shared/roles";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("admin-tools");

// Auth + admin guard on all routes in this module
router.use("*", authMiddleware);
router.use("*", requireAdmin);

let tokenServiceInstance: TokenService | null = null;
async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

// ── POST /admin/users/:id/impersonate ─────────────────────────────────────────
// Creates a short-lived session AS the target user for support purposes.
// Always audit-logged with the admin's identity.
router.post("/users/:id/impersonate", async (c) => {
  try {
    const admin = c.get("user");
    const token = c.get("token");
    if (token?.scope?.includes("impersonation") || (token?.act_as?.length ?? 0) > 0) {
      return c.json(
        { error: "FORBIDDEN", message: "Cannot impersonate while in an impersonation session" },
        403
      );
    }
    const targetId = c.req.param("id");

    const db = getDb();
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!target) return c.json({ error: "USER_NOT_FOUND" }, 404);
    if (hasRole(target, "admin")) {
      return c.json({ error: "FORBIDDEN", message: "Cannot impersonate another admin" }, 403);
    }

    const tokenSvc = await getTokenService();
    const sessionId = nodeCrypto.randomUUID();

    const accessToken = await tokenSvc.signAccessToken({
      sub: target.id,
      email: target.email,
      sid: sessionId,
      aud: "zerotrust",
      scope: ["openid", "impersonation"],
      act_as: [admin.id],
    });
    const payload = await tokenSvc.verifyAccessToken(accessToken);

    await createImpersonationSession({
      userId: target.id,
      session: {
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
      },
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
    return internalError(c, logger, "Impersonation error", err);
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
      return c.json({ error: "INVALID_REQUEST", message: `plan must be one of ${PLANS}` }, 400);
    }

    const db = getDb();
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!target) return c.json({ error: "USER_NOT_FOUND" }, 404);

    const trialEnd = trialDays > 0 ? new Date(Date.now() + trialDays * 86400_000) : null;
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
    return internalError(c, logger, "Plan override error", err);
  }
});

// ── GET /admin/revenue ────────────────────────────────────────────────────────
// MRR / ARR / churn / past-due summary from the subscriptions table.
router.get("/revenue", async (c) => {
  try {
    const db = getReadDb();
    const subs = await db.select().from(subscriptionsTable);

    const billable = subs.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    for (const s of billable) {
      const plan = (s.plan as Plan) in PLAN_CONFIGS ? (s.plan as Plan) : "free";
      byPlan[plan] = (byPlan[plan] ?? 0) + 1;
      mrr += PLAN_CONFIGS[plan].priceMonthly;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const canceledLast30 = subs.filter(
      (s) => s.status === "canceled" && s.canceledAt && s.canceledAt > thirtyDaysAgo
    ).length;
    const activeStart = billable.length + canceledLast30;
    const churnRate = activeStart > 0 ? +((canceledLast30 / activeStart) * 100).toFixed(2) : 0;

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
    return internalError(c, logger, "Revenue dashboard error", err);
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
      return c.json({ error: "INVALID_REQUEST", message: "title and message required" }, 400);
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
        }))
      );
    }

    // Optional email fan-out. Route through the BullMQ email queue when it's
    // available so SMTP sends are paced, retried, and don't saturate the
    // connection pool for large segments. Each enqueue is independent and
    // fire-and-forget; the queue owns backpressure and retries. Falls back to
    // a direct (still non-blocking) send when Redis/the queue is not running.
    if (sendEmail) {
      for (const r of recipients) {
        const payload = { name: r.displayName ?? r.email, title, body: message, link };
        void enqueueEmail("notification", r.email, payload).then((queued) => {
          if (!queued) {
            // Queue unavailable — deliver directly but still without blocking.
            void sendNotificationEmail(r.email, payload);
          }
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
    return internalError(c, logger, "Broadcast error", err);
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
    const db = getReadDb();
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
      }))
    );

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="users-${Date.now()}.csv"`);
    return c.body(csv);
  } catch (err) {
    return internalError(c, logger, "User export error", err);
  }
});

// GET /admin/audit/export/ndjson?limit=10000&since=ISO — signed NDJSON for SIEM
router.get("/audit/export/ndjson", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "10000", 10);
    const sinceRaw = c.req.query("since");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    if (sinceRaw && Number.isNaN(since!.getTime())) {
      return c.json({ error: "INVALID_REQUEST", message: "since must be ISO-8601" }, 400);
    }

    const { buildSignedNdjsonExport } = await import(
      "../../services/compliance/auditExport.service.js"
    );
    const result = await buildSignedNdjsonExport({ limit, since });

    c.header("Content-Type", "application/x-ndjson");
    c.header("X-Audit-Export-Signature", result.signature);
    c.header("X-Audit-Export-Id", result.exportId);
    c.header("X-Audit-Export-Row-Count", String(result.rowCount));
    if (result.chainTip) {
      c.header("X-Audit-Chain-Tip-Seq", String(result.chainTip.seq));
      c.header("X-Audit-Chain-Tip-Hash", result.chainTip.entryHash);
    }
    c.header("Content-Disposition", `attachment; filename="audit-${result.exportId}.ndjson"`);
    return c.body(result.ndjson);
  } catch (err) {
    return internalError(c, logger, "Audit NDJSON export error", err);
  }
});

// POST /admin/audit/export/ndjson/upload — export + S3 drop (when BACKUP_S3_BUCKET set)
router.post("/audit/export/ndjson/upload", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const limit = parseInt(body.limit ?? "10000", 10);
    const sinceRaw = body.since as string | undefined;
    const since = sinceRaw ? new Date(sinceRaw) : undefined;

    const { buildSignedNdjsonExport, uploadAuditExportToS3 } = await import(
      "../../services/compliance/auditExport.service.js"
    );
    const result = await buildSignedNdjsonExport({ limit, since });
    const s3Key = await uploadAuditExportToS3(result);

    return c.json({
      exportId: result.exportId,
      signature: result.signature,
      rowCount: result.rowCount,
      chainTip: result.chainTip,
      s3Key,
      uploaded: Boolean(s3Key),
    });
  } catch (err) {
    return internalError(c, logger, "Audit NDJSON S3 upload error", err);
  }
});

// GET /admin/audit/export?limit=10000 — CSV of recent audit log entries
router.get("/audit/export", async (c) => {
  try {
    const limit = Math.min(50_000, parseInt(c.req.query("limit") || "10000", 10));
    const db = getReadDb();
    const rows = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit);

    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        timestamp: r.timestamp?.toISOString?.() ?? r.timestamp,
        resourceDetails: r.resourceDetails ? JSON.stringify(r.resourceDetails) : "",
        continuousEvalContext: r.continuousEvalContext
          ? JSON.stringify(r.continuousEvalContext)
          : "",
        metadata: r.metadata ? JSON.stringify(r.metadata) : "",
      }))
    );

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="audit-${Date.now()}.csv"`);
    return c.body(csv);
  } catch (err) {
    return internalError(c, logger, "Audit export error", err);
  }
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
    return c.json({ error: "INVALID_REQUEST", message: "hold (boolean) is required" }, 400);
  }

  const ok = await setLegalHold(id, body.hold, {
    reason: body.reason,
    by: admin.id,
  });
  if (!ok) return c.json({ error: "NOT_FOUND", message: "User not found" }, 404);

  void auditLog(
    body.hold ? "admin.legal_hold.placed" : "admin.legal_hold.lifted",
    admin.id,
    id,
    true,
    { reason: body.reason }
  );
  return c.json({ success: true, userId: id, legalHold: body.hold });
});

export default router;
