import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import { organizationMembersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  archiveNote,
  createNote,
  getActivityFeed,
  getNote,
  getNoteRevisions,
  getOrgPresence,
  getUserMentions,
  globalSearch,
  heartbeatPresence,
  listNotes,
  setPresenceOffline,
  updateNote,
} from "../../services/collaboration.service";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("collaboration-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Global search ─────────────────────────────────────────────────────────────

// GET /search?q=...&orgId=...&type=... — global command-palette search with
// faceted filters: returns per-type counts ("instant counts") and, when `type`
// is given, narrows the results to that facet.
const FACET_TYPES = ["page", "user", "setting", "note"] as const;

router.get("/search", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const q = c.req.query("q") ?? "";
    const emptyFacets = Object.fromEntries(FACET_TYPES.map((t) => [t, 0]));
    if (q.length < 2) return c.json({ results: [], facets: emptyFacets, total: 0 });

    // Find an org context for the user (first membership)
    const db = getDb();
    const [membership] = await db
      .select({ orgId: organizationMembersTable.orgId })
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.userId, user.id))
      .limit(1);

    const orgId = c.req.query("orgId") || membership?.orgId || null;
    const typeFilter = c.req.query("type");

    // Pull a broad result set so the facet counts reflect everything available,
    // then apply the chosen facet filter to what we return.
    const all = await globalSearch(user.id, orgId, q, 50);
    const facets: Record<string, number> = Object.fromEntries(FACET_TYPES.map((t) => [t, 0]));
    for (const r of all) facets[r.type] = (facets[r.type] ?? 0) + 1;

    const filtered =
      typeFilter && (FACET_TYPES as readonly string[]).includes(typeFilter)
        ? all.filter((r) => r.type === typeFilter)
        : all;

    return c.json({ results: filtered.slice(0, 10), facets, total: filtered.length });
  } catch (err) {
    logger.error("Search error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Shared notes ───────────────────────────────────────────────────────────────

const createNoteSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().min(1).max(500),
  content: z.string().max(50_000).optional(),
});

// POST /notes — create a new shared note
router.post("/notes", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => ({}));
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    // Verify user is a member of the org
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, parsed.data.orgId),
          eq(organizationMembersTable.userId, user.id)
        )
      )
      .limit(1);

    if (!member) {
      return c.json({ error: "FORBIDDEN", message: "Not a member of this org" }, 403);
    }

    const note = await createNote({
      orgId: parsed.data.orgId,
      title: parsed.data.title,
      content: parsed.data.content,
      createdBy: user.id,
    });

    return c.json({ note }, 201);
  } catch (err) {
    logger.error("Create note error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /notes?orgId=...&limit=...&offset=... — list notes for an org
router.get("/notes", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const orgId = c.req.query("orgId");
    if (!orgId) return c.json({ error: "INVALID_REQUEST", message: "orgId required" }, 400);

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const notes = await listNotes(orgId, limit, offset);
    return c.json({ notes });
  } catch (err) {
    logger.error("List notes error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /notes/:id — get a single note with revisions
router.get("/notes/:id", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const noteId = c.req.param("id");
    const note = await getNote(noteId);
    if (!note) return c.json({ error: "NOT_FOUND" }, 404);

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, note.orgId),
          eq(organizationMembersTable.userId, user.id)
        )
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const revisions = await getNoteRevisions(noteId);
    return c.json({ note, revisions });
  } catch (err) {
    logger.error("Get note error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

const updateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().max(50_000).optional(),
});

// PUT /notes/:id — update a note
router.put("/notes/:id", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const noteId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    const note = await getNote(noteId);
    if (!note) return c.json({ error: "NOT_FOUND" }, 404);

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, note.orgId),
          eq(organizationMembersTable.userId, user.id)
        )
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const updated = await updateNote(noteId, user.id, parsed.data);
    return c.json({ note: updated });
  } catch (err) {
    logger.error("Update note error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /notes/:id — archive a note
router.delete("/notes/:id", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const noteId = c.req.param("id");
    const note = await getNote(noteId);
    if (!note) return c.json({ error: "NOT_FOUND" }, 404);

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, note.orgId),
          eq(organizationMembersTable.userId, user.id)
        )
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    await archiveNote(noteId, user.id);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Delete note error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Activity feed ─────────────────────────────────────────────────────────────

// GET /activity?orgId=...&limit=...&offset=... — team activity feed
router.get("/activity", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const orgId = c.req.query("orgId");
    if (!orgId) return c.json({ error: "INVALID_REQUEST", message: "orgId required" }, 400);

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const events = await getActivityFeed(orgId, limit, offset);
    return c.json({ events });
  } catch (err) {
    logger.error("Activity feed error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── @mentions ─────────────────────────────────────────────────────────────────

// GET /mentions — current user's mentions
router.get("/mentions", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10), 100);
    const mentions = await getUserMentions(user.id, limit);
    return c.json({ mentions });
  } catch (err) {
    logger.error("Mentions error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Presence ──────────────────────────────────────────────────────────────────

const presenceSchema = z.object({
  orgId: z.string().uuid(),
  status: z.enum(["online", "idle"]).default("online"),
});

// POST /presence/heartbeat — update user's presence
router.post("/presence/heartbeat", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => ({}));
    const parsed = presenceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, parsed.data.orgId),
          eq(organizationMembersTable.userId, user.id)
        )
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    await heartbeatPresence(
      user.id,
      parsed.data.orgId,
      user.displayName,
      undefined,
      parsed.data.status
    );
    return c.json({ success: true });
  } catch (err) {
    logger.error("Presence heartbeat error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /presence/offline — mark user as offline
router.post("/presence/offline", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    await setPresenceOffline(user.id);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Presence offline error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /presence/:orgId — get online members for an org
router.get("/presence/:orgId", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const orgId = c.req.param("orgId");

    // Verify membership
    const db = getDb();
    const [member] = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const presenceList = await getOrgPresence(orgId);
    return c.json({ presence: presenceList });
  } catch (err) {
    logger.error("Get presence error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
