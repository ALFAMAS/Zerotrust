import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { requirePlan } from "../../middleware/requirePlan";
import {
  getOrgBranding,
  resolveOrgByDomain,
  setOrgBranding,
  setOrgCustomDomain,
} from "../../services/ops/region.service";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();

// ── Public: resolve org by domain (used by login page, custom domain landing) ─

router.get("/resolve", async (c) => {
  const host = c.req.header("host") ?? c.req.query("domain") ?? "";
  if (!host) return c.json({ error: "BAD_REQUEST", message: "host or domain required" }, 400);

  const org = await resolveOrgByDomain(host);
  if (!org) return c.json({ error: "NOT_FOUND", message: "No org found for this domain" }, 404);

  return c.json({
    orgId: org.orgId,
    orgName: org.orgName,
    orgSlug: org.orgSlug,
    customDomain: org.customDomain,
    branding: {
      appName: org.branding.appName,
      brandColor: org.branding.brandColor,
      logoUrl: org.branding.logoUrl,
      faviconUrl: org.branding.faviconUrl,
      hidePoweredBy: org.branding.hidePoweredBy,
      customLoginUrl: org.branding.customLoginUrl,
    },
  });
});

// ── Authenticated: get org branding ───────────────────────────────────────────

router.use("/orgs/*", authMiddleware);

// GET /orgs/:orgId/branding — get branding config for an org
router.get("/orgs/:orgId/branding", async (c) => {
  const orgId = c.req.param("orgId");
  const branding = await getOrgBranding(orgId);
  return c.json(branding);
});

const brandingSchema = z.object({
  appName: z.string().max(100).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  hidePoweredBy: z.boolean().optional(),
  emailFromAddress: z.string().email().optional(),
  emailDomain: z.string().max(255).optional(),
  customLoginUrl: z.string().url().optional(),
});

// PUT /orgs/:orgId/branding — update branding (Pro+)
router.put(
  "/orgs/:orgId/branding",
  requirePlan("customRoles", { orgIdParam: "orgId" }),
  async (c) => {
  const orgId = c.req.param("orgId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  await setOrgBranding(orgId, parsed.data);
  return c.json({ success: true });
  }
);

const domainSchema = z.object({
  domain: z.string().max(255).nullable(),
});

// PUT /orgs/:orgId/domain — set custom domain (Enterprise)
router.put(
  "/orgs/:orgId/domain",
  requirePlan("ssoSaml", { orgIdParam: "orgId" }),
  async (c) => {
  const orgId = c.req.param("orgId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = domainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  try {
    await setOrgCustomDomain(orgId, parsed.data.domain);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "CONFLICT", message: err.message }, 409);
  }
  }
);

export default router;
