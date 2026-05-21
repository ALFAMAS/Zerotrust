/**
 * Tenant Management API — CRUD + SSO configuration + plan management
 * Mounted at /admin/tenants
 */

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { TenantModel } from "../../models/tenant.model";

const router = Router();

const SLUG_RE = /^[a-z0-9-]+$/;

const PLAN_MAX_USERS: Record<string, number | null> = {
  free: 100,
  starter: 1000,
  pro: 10000,
  enterprise: null, // unlimited
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function isObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;
}

async function findTenantByIdOrSlug(idOrSlug: string) {
  if (isObjectId(idOrSlug)) {
    return TenantModel.findById(idOrSlug);
  }
  return TenantModel.findOne({ slug: idOrSlug });
}

// ─── POST / — Create tenant ───────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug, name, displayName, status, plan, settings } = req.body as {
      slug?: string;
      name?: string;
      displayName?: string;
      status?: string;
      plan?: string;
      settings?: Record<string, unknown>;
    };

    if (!slug || !name) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "slug and name are required", details: [] });
      return;
    }

    if (!SLUG_RE.test(slug)) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "slug must be lowercase alphanumeric characters and hyphens only",
        details: [],
      });
      return;
    }

    const existing = await TenantModel.findOne({ slug });
    if (existing) {
      res.status(409).json({ code: "CONFLICT", message: `Tenant with slug '${slug}' already exists`, details: [] });
      return;
    }

    const tenant = await TenantModel.create({
      slug,
      name,
      displayName: displayName ?? name,
      ...(status && { status }),
      ...(plan && { plan }),
      ...(settings && { settings }),
    });

    res.status(201).json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to create tenant", details: [] });
  }
});

// ─── GET / — List tenants ─────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, plan } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)));

    const filter: Record<string, string> = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;

    const [tenants, total] = await Promise.all([
      TenantModel.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      TenantModel.countDocuments(filter),
    ]);

    res.json({ tenants, total, page, limit });
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to list tenants", details: [] });
  }
});

// ─── GET /:id — Get tenant ────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await findTenantByIdOrSlug(req.params.id);
    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to get tenant", details: [] });
  }
});

// ─── PUT /:id — Update tenant ─────────────────────────────────────────────────

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, displayName, status, plan, settings } = req.body as {
      name?: string;
      displayName?: string;
      status?: string;
      plan?: string;
      settings?: Record<string, unknown>;
    };

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (displayName !== undefined) update.displayName = displayName;
    if (status !== undefined) update.status = status;
    if (plan !== undefined) update.plan = plan;
    if (settings !== undefined) update.settings = settings;

    let query;
    if (isObjectId(req.params.id)) {
      query = TenantModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    } else {
      query = TenantModel.findOneAndUpdate({ slug: req.params.id }, { $set: update }, { new: true, runValidators: true });
    }

    const tenant = await query;
    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to update tenant", details: [] });
  }
});

// ─── DELETE /:id — Soft-delete tenant ────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(
        req.params.id,
        { $set: { status: "deleted" } },
        { new: true }
      );
    } else {
      tenant = await TenantModel.findOneAndUpdate(
        { slug: req.params.id },
        { $set: { status: "deleted" } },
        { new: true }
      );
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json({ message: "Tenant deleted", id: tenant._id });
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to delete tenant", details: [] });
  }
});

// ─── POST /:id/sso/oidc — Configure OIDC SSO ─────────────────────────────────

router.post("/:id/sso/oidc", async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId, clientSecret: _clientSecret, redirectUris, scopes } = req.body as {
      clientId?: string;
      clientSecret?: string;
      redirectUris?: string[];
      scopes?: string[];
    };

    if (!clientId || !redirectUris?.length) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "clientId and redirectUris are required", details: [] });
      return;
    }

    const update = {
      "oidcConfig.enabled": true,
      "oidcConfig.clientId": clientId,
      "oidcConfig.redirectUris": redirectUris,
      "oidcConfig.scopes": scopes ?? ["openid", "profile", "email"],
    };

    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    } else {
      tenant = await TenantModel.findOneAndUpdate({ slug: req.params.id }, { $set: update }, { new: true });
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to configure OIDC SSO", details: [] });
  }
});

// ─── DELETE /:id/sso/oidc — Disable OIDC SSO ─────────────────────────────────

router.delete("/:id/sso/oidc", async (req: Request, res: Response): Promise<void> => {
  try {
    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(
        req.params.id,
        { $set: { "oidcConfig.enabled": false } },
        { new: true }
      );
    } else {
      tenant = await TenantModel.findOneAndUpdate(
        { slug: req.params.id },
        { $set: { "oidcConfig.enabled": false } },
        { new: true }
      );
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to disable OIDC SSO", details: [] });
  }
});

// ─── POST /:id/sso/saml — Configure SAML SSO ─────────────────────────────────

router.post("/:id/sso/saml", async (req: Request, res: Response): Promise<void> => {
  try {
    const { idpEntityId, idpSsoUrl, idpCert, spEntityId, attributeMap } = req.body as {
      idpEntityId?: string;
      idpSsoUrl?: string;
      idpCert?: string;
      spEntityId?: string;
      attributeMap?: Record<string, string>;
    };

    if (!idpEntityId || !idpSsoUrl || !idpCert) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "idpEntityId, idpSsoUrl, and idpCert are required",
        details: [],
      });
      return;
    }

    const update: Record<string, unknown> = {
      "samlConfig.enabled": true,
      "samlConfig.idpEntityId": idpEntityId,
      "samlConfig.idpSsoUrl": idpSsoUrl,
      "samlConfig.idpCert": idpCert,
    };
    if (spEntityId) update["samlConfig.spEntityId"] = spEntityId;
    if (attributeMap) update["samlConfig.attributeMap"] = attributeMap;

    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    } else {
      tenant = await TenantModel.findOneAndUpdate({ slug: req.params.id }, { $set: update }, { new: true });
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to configure SAML SSO", details: [] });
  }
});

// ─── DELETE /:id/sso/saml — Disable SAML SSO ─────────────────────────────────

router.delete("/:id/sso/saml", async (req: Request, res: Response): Promise<void> => {
  try {
    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(
        req.params.id,
        { $set: { "samlConfig.enabled": false } },
        { new: true }
      );
    } else {
      tenant = await TenantModel.findOneAndUpdate(
        { slug: req.params.id },
        { $set: { "samlConfig.enabled": false } },
        { new: true }
      );
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to disable SAML SSO", details: [] });
  }
});

// ─── POST /:id/plan — Upgrade/downgrade plan ──────────────────────────────────

router.post("/:id/plan", async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan } = req.body as { plan?: string };

    if (!plan || !Object.keys(PLAN_MAX_USERS).includes(plan)) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: `plan must be one of: ${Object.keys(PLAN_MAX_USERS).join(", ")}`,
        details: [],
      });
      return;
    }

    const maxUsers = PLAN_MAX_USERS[plan];
    const update: Record<string, unknown> = { plan };
    if (maxUsers !== null) {
      update["settings.maxUsers"] = maxUsers;
    } else {
      // enterprise: remove the cap — set to a very large number to keep the field valid
      update["settings.maxUsers"] = 2_147_483_647;
    }

    let tenant;
    if (isObjectId(req.params.id)) {
      tenant = await TenantModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    } else {
      tenant = await TenantModel.findOneAndUpdate({ slug: req.params.id }, { $set: update }, { new: true, runValidators: true });
    }

    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to update plan", details: [] });
  }
});

// ─── GET /:id/stats — Tenant statistics ──────────────────────────────────────

router.get("/:id/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await findTenantByIdOrSlug(req.params.id);
    if (!tenant) {
      res.status(404).json({ code: "NOT_FOUND", message: "Tenant not found", details: [] });
      return;
    }

    // Placeholder — would query User, Session collections in production
    res.json({
      tenantId: tenant._id,
      slug: tenant.slug,
      userCount: 0,
      sessionCount: 0,
      lastActivityAt: null,
    });
  } catch (err) {
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to retrieve stats", details: [] });
  }
});

export default router;
