import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { isValidRegion } from "../../services/region.service";
import {
  deleteDocument,
  indexDocument,
  type SearchableType,
  search,
  searchProvider,
  smartSearch,
} from "../../services/search.service";
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("search-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Global search ─────────────────────────────────────────────────────────────

// GET /search?q=...&orgId=...&type=...&region=...&page=...&limit=...
router.get("/", async (c) => {
  const { page, limit } = parsePaginatedQuery(c.req.query(), { defaultLimit: 20, maxLimit: 50 });
  const type = c.req.query("type") as SearchableType | undefined;
  const rawRegion = c.req.query("region");
  const region = rawRegion && isValidRegion(rawRegion) ? rawRegion : undefined;
  const q = c.req.query("q");
  const orgId = c.req.query("orgId");
  if (!q || q.length < 1 || q.length > 200) {
    return c.json({ error: "INVALID_REQUEST", message: "q must be 1-200 chars" }, 400);
  }
  try {
    const results = await search({ query: q, orgId, type, region, limit });
    return c.json({
      provider: results.provider,
      ...paginated(results.hits, { page, limit, total: results.total }),
    });
  } catch (err) {
    return internalError(c, logger, "Search error", err);
  }
});

// ── Smart search (ranked full-text) ──────────────────────────────────────────

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
      region: parsed.data.region,
      limit: parsed.data.limit ?? 10,
    });
    return c.json(results);
  } catch (err) {
    return internalError(c, logger, "Smart search error", err);
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
    region: parsed.data.region ?? "us",
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
