import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  deleteDocument,
  indexDocument,
  type SearchableType,
  search,
  searchProvider,
  smartSearch,
} from "../../services/search.service";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("search-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Global search ─────────────────────────────────────────────────────────────

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  orgId: z.string().uuid().optional(),
  type: z.enum(["user", "org", "ticket"]).optional(),
  region: z.enum(["us", "eu", "apac"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// GET /search?q=...&orgId=...&type=...&region=...&limit=...
router.get("/", async (c) => {
  const parsed = searchSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  try {
    const results = await search({
      query: parsed.data.q,
      orgId: parsed.data.orgId,
      type: parsed.data.type as SearchableType | undefined,
      region: parsed.data.region as any,
      limit: parsed.data.limit ?? 20,
    });
    return c.json(results);
  } catch (err) {
    logger.error("Search error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Smart search (semantic) ──────────────────────────────────────────────────

const smartSearchSchema = z.object({
  q: z.string().min(1).max(500),
  orgId: z.string().uuid().optional(),
  region: z.enum(["us", "eu", "apac"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

// GET /search/smart?q=...
router.get("/smart", async (c) => {
  const parsed = smartSearchSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  try {
    const results = await smartSearch({
      query: parsed.data.q,
      orgId: parsed.data.orgId,
      region: parsed.data.region as any,
      limit: parsed.data.limit ?? 10,
    });
    return c.json(results);
  } catch (err) {
    logger.error("Smart search error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Index management (admin) ──────────────────────────────────────────────────

const indexSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["user", "org", "ticket"]),
  orgId: z.string().uuid(),
  title: z.string().min(1).max(500),
  content: z.string().max(50_000).optional(),
  region: z.enum(["us", "eu", "apac"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// POST /search/index — index a document
router.post("/index", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = indexSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  const ok = await indexDocument({
    id: parsed.data.id,
    type: parsed.data.type,
    orgId: parsed.data.orgId,
    title: parsed.data.title,
    content: parsed.data.content ?? "",
    region: (parsed.data.region ?? "us") as any,
    metadata: parsed.data.metadata,
  });
  return c.json({ success: ok });
});

// DELETE /search/index/:type/:id — remove a document from the index
router.delete("/index/:type/:id", async (c) => {
  const type = c.req.param("type") as SearchableType;
  const id = c.req.param("id");
  if (!["user", "org", "ticket"].includes(type)) {
    return c.json({ error: "INVALID_REQUEST" }, 400);
  }
  const ok = await deleteDocument(type, id);
  return c.json({ success: ok });
});

// GET /search/provider — which search backend is active
router.get("/provider", (c) => {
  return c.json({ provider: searchProvider() });
});

export default router;
