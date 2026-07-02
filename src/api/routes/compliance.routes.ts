import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  addRiskAssessment,
  getRiskAssessment,
  getSoc2Controls,
  getSoc2Readiness,
  updateRiskStatus,
  updateSoc2Control,
} from "../../services/compliance/compliance.service";
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("compliance-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── SOC 2 readiness ──────────────────────────────────────────────────────────

// GET /compliance/soc2/readiness — overall readiness score
router.get("/soc2/readiness", async (c) => {
  try {
    const readiness = await getSoc2Readiness();
    return c.json(readiness);
  } catch (err) {
    return internalError(c, logger, "SOC 2 readiness error", err);
  }
});

// GET /compliance/soc2/controls — list all controls
router.get("/soc2/controls", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const controls = await getSoc2Controls();
    // Slice in-memory from preloaded controls (static config, not DB-driven)
    const total = controls.length;
    const sliced = controls.slice(offset, offset + limit);
    return c.json(paginated(sliced, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "SOC 2 controls error", err);
  }
});

const soc2UpdateSchema = z.object({
  status: z.enum(["implemented", "partial", "planned"]).optional(),
  implementation: z.string().min(1).optional(),
  evidence: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
});

// PUT /compliance/soc2/controls/:controlId — update a control
router.put("/soc2/controls/:controlId", async (c) => {
  try {
    const controlId = c.req.param("controlId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = soc2UpdateSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    await updateSoc2Control(controlId, parsed.data);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "SOC 2 update error", err);
  }
});

// ── Risk assessment ───────────────────────────────────────────────────────────

// GET /compliance/risk-assessment/:year — get annual risk assessment
router.get("/risk-assessment/:year", async (c) => {
  try {
    const year = parseInt(c.req.param("year"), 10);
    if (Number.isNaN(year) || year < 2020 || year > 2100) {
      return c.json({ error: "INVALID_REQUEST", message: "Invalid year" }, 400);
    }
    const assessment = await getRiskAssessment(year);
    return c.json(assessment);
  } catch (err) {
    return internalError(c, logger, "Risk assessment error", err);
  }
});

const riskSchema = z.object({
  riskId: z.string().min(1).max(20),
  category: z.enum(["security", "availability", "compliance", "financial"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  riskScore: z.number().int().min(1).max(25),
  treatment: z.enum(["mitigate", "accept", "transfer", "avoid"]),
  mitigation: z.string().min(1),
  owner: z.string().min(1),
  status: z.enum(["open", "mitigated", "closed"]).default("open"),
});

// POST /compliance/risk-assessment/:year — add a risk item
router.post("/risk-assessment/:year", async (c) => {
  try {
    const year = parseInt(c.req.param("year"), 10);
    if (Number.isNaN(year) || year < 2020 || year > 2100) {
      return c.json({ error: "INVALID_REQUEST", message: "Invalid year" }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = riskSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    await addRiskAssessment({ ...parsed.data, year });
    return c.json({ success: true }, 201);
  } catch (err) {
    return internalError(c, logger, "Add risk error", err);
  }
});

const riskStatusSchema = z.object({
  status: z.enum(["open", "mitigated", "closed"]),
});

// PUT /compliance/risk-assessment/:year/:riskId — update risk status
router.put("/risk-assessment/:year/:riskId", async (c) => {
  try {
    const year = parseInt(c.req.param("year"), 10);
    const riskId = c.req.param("riskId");
    if (Number.isNaN(year)) return c.json({ error: "INVALID_REQUEST" }, 400);
    const body = await c.req.json().catch(() => ({}));
    const parsed = riskStatusSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    await updateRiskStatus(year, riskId, parsed.data.status);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "Update risk status error", err);
  }
});

export default router;
