import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { insertAuditLog } from "../../audit/chain";
import { getDb } from "../../db";
import { accessReviewItemsTable, accessReviewsTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware, requireAdmin } from "../../middleware/auth";
import { invalidateUserCache } from "../../services/auth/userStateCache.service";
import { countRows } from "../../shared/dbCount";
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("access-review-routes");

// Auth + admin guard on all routes
router.use("*", authMiddleware);
router.use("*", requireAdmin);

const isPrivileged = (roles: string[] | null | undefined) =>
  Array.isArray(roles) && roles.some((r) => r && r !== "user");

// POST / — start a new access review, snapshotting every privileged user
router.post("/", async (c) => {
  try {
    const admin = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(ne(usersTable.status, "deleted"));

    const privileged = users.filter((u) => isPrivileged(u.roles));

    const defaultTitle = `Access review — ${new Date().toISOString().slice(0, 10)}`;
    const [review] = await db
      .insert(accessReviewsTable)
      .values({
        title: (body.title as string)?.trim() || defaultTitle,
        note: (body.note as string) ?? null,
        createdBy: admin.id,
        createdByEmail: admin.email,
      })
      .returning();

    if (privileged.length > 0) {
      await db.insert(accessReviewItemsTable).values(
        privileged.map((u) => ({
          reviewId: review.id,
          userId: u.id,
          userEmail: u.email,
          userDisplayName: u.displayName,
          rolesSnapshot: u.roles ?? [],
        }))
      );
    }

    await insertAuditLog({
      action: "ACCESS_REVIEW_CREATED",
      actorId: admin.id,
      actorEmail: admin.email,
      targetId: review.id,
      targetType: "access_review",
      success: true,
      metadata: { itemCount: privileged.length },
    });

    return c.json({ review, itemCount: privileged.length }, 201);
  } catch (err) {
    return internalError(
      c,
      logger,
      "Create access review error",
      err,
      "Failed to create access review"
    );
  }
});

// GET / — list reviews with item / pending counts
router.get("/", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query());
    const db = getDb();
    const where = undefined; // could add status filter later
    const [reviews, total, counts] = await Promise.all([
      db
        .select()
        .from(accessReviewsTable)
        .where(where)
        .orderBy(desc(accessReviewsTable.createdAt))
        .offset(offset)
        .limit(limit),
      countRows(db, accessReviewsTable, where),
      db
        .select({
          reviewId: accessReviewItemsTable.reviewId,
          total: sql<number>`count(*)::int`,
          pending: sql<number>`count(*) filter (where ${accessReviewItemsTable.decision} = 'pending')::int`,
        })
        .from(accessReviewItemsTable)
        .groupBy(accessReviewItemsTable.reviewId),
    ]);

    const byId = new Map(counts.map((r) => [r.reviewId, r]));
    const enriched = reviews.map((r) => ({
      ...r,
      itemCount: byId.get(r.id)?.total ?? 0,
      pendingCount: byId.get(r.id)?.pending ?? 0,
    }));

    return c.json(paginated(enriched, { page, limit, total }));
  } catch (err) {
    return internalError(
      c,
      logger,
      "List access reviews error",
      err,
      "Failed to list access reviews"
    );
  }
});

// GET /:id — review with its items (paginated)
router.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { page, limit, offset } = parsePaginatedQuery(c.req.query());
    const db = getDb();
    const [review] = await db
      .select()
      .from(accessReviewsTable)
      .where(eq(accessReviewsTable.id, id))
      .limit(1);
    if (!review) return c.json({ error: "NOT_FOUND", message: "Access review not found" }, 404);

    const where = eq(accessReviewItemsTable.reviewId, id);
    const [items, total] = await Promise.all([
      db
        .select()
        .from(accessReviewItemsTable)
        .where(where)
        .orderBy(desc(accessReviewItemsTable.createdAt))
        .offset(offset)
        .limit(limit),
      countRows(db, accessReviewItemsTable, where),
    ]);

    return c.json({
      review,
      items: paginated(items, { page, limit, total }),
    });
  } catch (err) {
    return internalError(c, logger, "Get access review error", err, "Failed to get access review");
  }
});

const VALID_DECISIONS = new Set(["approved", "revoked", "flagged", "pending"]);

// PATCH /:id/items/:itemId — record a decision. "revoked" also strips the
// user's elevated roles down to ['user'] (the access being revoked).
router.patch("/:id/items/:itemId", async (c) => {
  try {
    const admin = c.get("user");
    const { id, itemId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const decision = String(body.decision || "");
    if (!VALID_DECISIONS.has(decision)) {
      return c.json(
        { error: "INVALID_DECISION", message: "decision must be approved|revoked|flagged" },
        400
      );
    }

    const db = getDb();
    const [item] = await db
      .select()
      .from(accessReviewItemsTable)
      .where(and(eq(accessReviewItemsTable.id, itemId), eq(accessReviewItemsTable.reviewId, id)))
      .limit(1);
    if (!item) return c.json({ error: "NOT_FOUND", message: "Review item not found" }, 404);

    let rolesRevoked = false;
    if (decision === "revoked") {
      // Enforce the revocation: drop all elevated roles for the user.
      await db
        .update(usersTable)
        .set({ roles: ["user"], updatedAt: new Date() })
        .where(eq(usersTable.id, item.userId));
      await invalidateUserCache(item.userId);
      rolesRevoked = true;
      await insertAuditLog({
        action: "ACCESS_REVIEW_ROLES_REVOKED",
        actorId: admin.id,
        actorEmail: admin.email,
        targetId: item.userId,
        targetType: "user",
        success: true,
        metadata: { reviewId: id, previousRoles: item.rolesSnapshot },
      });
    }

    const [updated] = await db
      .update(accessReviewItemsTable)
      .set({
        decision,
        note: (body.note as string) ?? item.note,
        decidedBy: admin.id,
        decidedByEmail: admin.email,
        decidedAt: new Date(),
      })
      .where(eq(accessReviewItemsTable.id, itemId))
      .returning();

    return c.json({ item: updated, rolesRevoked });
  } catch (err) {
    return internalError(
      c,
      logger,
      "Decide access review item error",
      err,
      "Failed to record decision"
    );
  }
});

// POST /:id/complete — close the review (all items must be decided)
router.post("/:id/complete", async (c) => {
  try {
    const admin = c.get("user");
    const id = c.req.param("id");
    const db = getDb();

    const pendingCount = await countRows(
      db,
      accessReviewItemsTable,
      and(eq(accessReviewItemsTable.reviewId, id), eq(accessReviewItemsTable.decision, "pending"))
    );

    if (pendingCount > 0) {
      return c.json(
        { error: "INCOMPLETE", message: `${pendingCount} item(s) still pending a decision` },
        400
      );
    }

    const [review] = await db
      .update(accessReviewsTable)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(accessReviewsTable.id, id))
      .returning();
    if (!review) return c.json({ error: "NOT_FOUND", message: "Access review not found" }, 404);

    await insertAuditLog({
      action: "ACCESS_REVIEW_COMPLETED",
      actorId: admin.id,
      actorEmail: admin.email,
      targetId: id,
      targetType: "access_review",
      success: true,
    });

    return c.json({ review });
  } catch (err) {
    return internalError(
      c,
      logger,
      "Complete access review error",
      err,
      "Failed to complete access review"
    );
  }
});

export default router;
