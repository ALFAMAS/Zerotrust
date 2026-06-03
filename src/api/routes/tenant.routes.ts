/**
 * Tenant Management API — CRUD + SSO configuration + plan management
 * Mounted at /admin/tenants
 * Uses an in-memory store (no tenants table in the DB schema yet).
 */

import { Hono } from "hono";
import type { HonoEnv } from "../../shared/types";
import {
  getAllTenants,
  getTenant,
  getTenantBySlug,
  createTenant,
  updateTenant,
  type OidcConfig,
  type SamlConfig,
  type TenantSettings,
} from "../../models/tenant.model.js";

const router = new Hono<HonoEnv>();

const SLUG_RE = /^[a-z0-9-]+$/;

const PLAN_MAX_USERS: Record<string, number | null> = {
  free: 100,
  starter: 1000,
  pro: 10000,
  enterprise: null, // unlimited
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function findByIdOrSlug(idOrSlug: string) {
  // Try as UUID-shaped id first, then fall back to slug lookup
  const byId = getTenant(idOrSlug);
  return byId ?? getTenantBySlug(idOrSlug);
}

// ─── Admin role guard ─────────────────────────────────────────────────────────

router.use("/*", async (c, next) => {
  const user = c.get("user");
  if (!user || !user.roles.includes("admin")) {
    return c.json({ code: "ACCESS_DENIED", message: "Admin role required", details: [] }, 403);
  }
  return next();
});

// ─── POST / — Create tenant ───────────────────────────────────────────────────

router.post("/", async (c) => {
  try {
    const { slug, name, displayName, status, plan, settings } = (await c.req.json()) as {
      slug?: string;
      name?: string;
      displayName?: string;
      status?: string;
      plan?: string;
      settings?: Record<string, unknown>;
    };

    if (!slug || !name) {
      return c.json(
        { code: "VALIDATION_ERROR", message: "slug and name are required", details: [] },
        400
      );
    }

    if (!SLUG_RE.test(slug)) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "slug must be lowercase alphanumeric characters and hyphens only",
          details: [],
        },
        400
      );
    }

    const existing = getTenantBySlug(slug);
    if (existing) {
      return c.json(
        { code: "CONFLICT", message: `Tenant with slug '${slug}' already exists`, details: [] },
        409
      );
    }

    const tenant = createTenant({
      slug,
      name,
      displayName: displayName ?? name,
      ...(status && { status: status as "active" | "suspended" | "trial" }),
      ...(plan && { plan: plan as "free" | "starter" | "pro" | "enterprise" }),
      ...(settings && { settings: settings as Partial<TenantSettings> }),
    });

    return c.json(tenant, 201);
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to create tenant", details: [] }, 500);
  }
});

// ─── GET / — List tenants ─────────────────────────────────────────────────────

router.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const plan = c.req.query("plan");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));

    let tenants = getAllTenants();
    if (status) tenants = tenants.filter((t) => t.status === status);
    if (plan) tenants = tenants.filter((t) => t.plan === plan);

    tenants.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = tenants.length;
    const paged = tenants.slice((page - 1) * limit, (page - 1) * limit + limit);

    return c.json({ tenants: paged, total, page, limit });
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to list tenants", details: [] }, 500);
  }
});

// ─── GET /:id — Get tenant ────────────────────────────────────────────────────

router.get("/:id", async (c) => {
  try {
    const tenant = findByIdOrSlug(c.req.param("id"));
    if (!tenant) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }
    return c.json(tenant);
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to get tenant", details: [] }, 500);
  }
});

// ─── PUT /:id — Update tenant ─────────────────────────────────────────────────

router.put("/:id", async (c) => {
  try {
    const { name, displayName, status, plan, settings } = (await c.req.json()) as {
      name?: string;
      displayName?: string;
      status?: string;
      plan?: string;
      settings?: Record<string, unknown>;
    };

    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const update: Parameters<typeof updateTenant>[1] = {};
    if (name !== undefined) update.name = name;
    if (displayName !== undefined) update.displayName = displayName;
    if (status !== undefined)
      update.status = status as "active" | "suspended" | "trial" | "deleted";
    if (plan !== undefined) update.plan = plan as "free" | "starter" | "pro" | "enterprise";
    if (settings !== undefined) update.settings = settings as never;

    const tenant = updateTenant(existing.id, update);
    return c.json(tenant);
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to update tenant", details: [] }, 500);
  }
});

// ─── DELETE /:id — Soft-delete tenant ────────────────────────────────────────

router.delete("/:id", async (c) => {
  try {
    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const tenant = updateTenant(existing.id, { status: "deleted" });
    return c.json({ message: "Tenant deleted", id: tenant!.id });
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to delete tenant", details: [] }, 500);
  }
});

// ─── POST /:id/sso/oidc — Configure OIDC SSO ─────────────────────────────────

router.post("/:id/sso/oidc", async (c) => {
  try {
    const {
      clientId,
      clientSecret: _clientSecret,
      redirectUris,
      scopes,
    } = (await c.req.json()) as {
      clientId?: string;
      clientSecret?: string;
      redirectUris?: string[];
      scopes?: string[];
    };

    if (!clientId || !redirectUris?.length) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "clientId and redirectUris are required",
          details: [],
        },
        400
      );
    }

    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const oidcConfig: OidcConfig = {
      enabled: true,
      clientId,
      redirectUris,
      scopes: scopes ?? ["openid", "profile", "email"],
    };

    const tenant = updateTenant(existing.id, { oidcConfig });
    return c.json(tenant);
  } catch {
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to configure OIDC SSO", details: [] },
      500
    );
  }
});

// ─── DELETE /:id/sso/oidc — Disable OIDC SSO ─────────────────────────────────

router.delete("/:id/sso/oidc", async (c) => {
  try {
    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const oidcConfig: OidcConfig = {
      ...(existing.oidcConfig ?? {
        enabled: false,
        clientId: "",
        redirectUris: [],
        scopes: [],
      }),
      enabled: false,
    };

    const tenant = updateTenant(existing.id, { oidcConfig });
    return c.json(tenant);
  } catch {
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to disable OIDC SSO", details: [] },
      500
    );
  }
});

// ─── POST /:id/sso/saml — Configure SAML SSO ─────────────────────────────────

router.post("/:id/sso/saml", async (c) => {
  try {
    const { idpEntityId, idpSsoUrl, idpCert, spEntityId, attributeMap } = (await c.req.json()) as {
      idpEntityId?: string;
      idpSsoUrl?: string;
      idpCert?: string;
      spEntityId?: string;
      attributeMap?: Record<string, string>;
    };

    if (!idpEntityId || !idpSsoUrl || !idpCert) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "idpEntityId, idpSsoUrl, and idpCert are required",
          details: [],
        },
        400
      );
    }

    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const samlConfig: SamlConfig = {
      enabled: true,
      idpEntityId,
      idpSsoUrl,
      idpCert,
      spEntityId: spEntityId ?? "",
      attributeMap: attributeMap ?? {},
    };

    const tenant = updateTenant(existing.id, { samlConfig });
    return c.json(tenant);
  } catch {
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to configure SAML SSO", details: [] },
      500
    );
  }
});

// ─── DELETE /:id/sso/saml — Disable SAML SSO ─────────────────────────────────

router.delete("/:id/sso/saml", async (c) => {
  try {
    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const samlConfig: SamlConfig = {
      ...(existing.samlConfig ?? {
        enabled: false,
        idpEntityId: "",
        idpSsoUrl: "",
        idpCert: "",
        spEntityId: "",
        attributeMap: {},
      }),
      enabled: false,
    };

    const tenant = updateTenant(existing.id, { samlConfig });
    return c.json(tenant);
  } catch {
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to disable SAML SSO", details: [] },
      500
    );
  }
});

// ─── POST /:id/plan — Upgrade/downgrade plan ──────────────────────────────────

router.post("/:id/plan", async (c) => {
  try {
    const { plan } = (await c.req.json()) as { plan?: string };

    if (!plan || !Object.keys(PLAN_MAX_USERS).includes(plan)) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: `plan must be one of: ${Object.keys(PLAN_MAX_USERS).join(", ")}`,
          details: [],
        },
        400
      );
    }

    const existing = findByIdOrSlug(c.req.param("id"));
    if (!existing) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    const maxUsers = PLAN_MAX_USERS[plan] ?? 2_147_483_647;
    const tenant = updateTenant(existing.id, {
      plan: plan as "free" | "starter" | "pro" | "enterprise",
      settings: { ...existing.settings, maxUsers },
    });
    return c.json(tenant);
  } catch {
    return c.json({ code: "INTERNAL_ERROR", message: "Failed to update plan", details: [] }, 500);
  }
});

// ─── GET /:id/stats — Tenant statistics ──────────────────────────────────────

router.get("/:id/stats", async (c) => {
  try {
    const tenant = findByIdOrSlug(c.req.param("id"));
    if (!tenant) {
      return c.json({ code: "NOT_FOUND", message: "Tenant not found", details: [] }, 404);
    }

    return c.json({
      tenantId: tenant.id,
      slug: tenant.slug,
      userCount: 0,
      sessionCount: 0,
      lastActivityAt: null,
    });
  } catch {
    return c.json(
      { code: "INTERNAL_ERROR", message: "Failed to retrieve stats", details: [] },
      500
    );
  }
});

export default router;
