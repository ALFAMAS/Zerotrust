import { and, desc, eq, ilike } from "drizzle-orm";
import { Hono } from "hono";
import { verifyAuditChain } from "../../../audit/chain";
import { getReadDb } from "../../../db";
import { auditLogsTable } from "../../../db/schema";
import { requirePlan } from "../../../middleware/requirePlan";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../../shared/pagination";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// ── Audit Logs ───────────────────────────────────────────────────────────────

// GET /audit-logs?page=1&limit=50&action=&actorId= (Pro+ audit log export)
router.get("/audit-logs", requirePlan("auditLog"), async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const action = c.req.query("action");
    const actorId = c.req.query("actorId");

    const db = getReadDb();
    const conditions: any[] = [];
    if (action) conditions.push(ilike(auditLogsTable.action, `%${action}%`));
    if (actorId) conditions.push(eq(auditLogsTable.actorId, actorId));

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [logs, total] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(whereClause)
        .orderBy(desc(auditLogsTable.timestamp))
        .offset(offset)
        .limit(limit),
      countRows(db, auditLogsTable, whereClause),
    ]);

    return c.json(paginated(logs, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin audit logs error", err, "Failed to fetch audit logs");
  }
});

// GET /audit-logs/verify?limit=1000 — verify the tamper-evidence hash chain (Pro+)
router.get("/audit-logs/verify", requirePlan("auditLog"), async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "1000", 10), 10000);
    const result = await verifyAuditChain(limit);
    return c.json(result);
  } catch (err) {
    return internalError(
      c,
      logger,
      "Admin audit chain verify error",
      err,
      "Failed to verify audit chain"
    );
  }
});

export default router;
