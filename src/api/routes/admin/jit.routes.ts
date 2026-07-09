import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { jitAccessTable } from "../../../db/schema";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// ── JIT Grants ───────────────────────────────────────────────────────────────

// GET /jit-grants?status=pending
router.get("/jit-grants", async (c) => {
  try {
    const status = c.req.query("status");
    const db = getReadDb();

    const conditions: any[] = [];
    if (status) conditions.push(eq(jitAccessTable.status, status));

    const grants = await db
      .select()
      .from(jitAccessTable)
      .where(conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined)
      .orderBy(desc(jitAccessTable.requestedAt));

    return c.json({ grants });
  } catch (err) {
    return internalError(
      c,
      logger,
      "Admin list JIT grants error",
      err,
      "Failed to list JIT grants"
    );
  }
});

// POST /jit-grants/:id/approve
router.post("/jit-grants/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    const adminId = c.get("user").id;
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jitAccessTable.id, id), eq(jitAccessTable.status, "pending")))
      .returning();

    if (rows.length === 0) {
      return c.json(
        { error: "JIT_NOT_FOUND", message: "JIT grant not found or already processed" },
        404
      );
    }

    return c.json({ success: true, grant: rows[0] });
  } catch (err) {
    return internalError(c, logger, "Admin approve JIT error", err, "Failed to approve JIT grant");
  }
});

// POST /jit-grants/:id/deny
router.post("/jit-grants/:id/deny", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({ status: "denied", updatedAt: new Date() })
      .where(and(eq(jitAccessTable.id, id), eq(jitAccessTable.status, "pending")))
      .returning();

    if (rows.length === 0) {
      return c.json(
        { error: "JIT_NOT_FOUND", message: "JIT grant not found or already processed" },
        404
      );
    }

    return c.json({ success: true, grant: rows[0] });
  } catch (err) {
    return internalError(c, logger, "Admin deny JIT error", err, "Failed to deny JIT grant");
  }
});

// DELETE /jit-grants/:id — revoke an approved grant
router.delete("/jit-grants/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const adminId = c.get("user").id;
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: adminId, updatedAt: new Date() })
      .where(and(eq(jitAccessTable.id, id)))
      .returning({ id: jitAccessTable.id });

    if (rows.length === 0) {
      return c.json({ error: "JIT_NOT_FOUND", message: "JIT grant not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "Admin revoke JIT error", err, "Failed to revoke JIT grant");
  }
});


export default router;
