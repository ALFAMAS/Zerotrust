import type { Request, Response, NextFunction } from "express";
import { TenantModel, type TenantDocument } from "../models/tenant.model";
import { getLogger } from "../logger";

const logger = getLogger("tenant-middleware");

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantDocument;
      tenantId?: string;
    }
  }
}

/**
 * Resolve the current tenant from the request.
 *
 * Resolution order:
 * 1. X-Tenant-ID header (slug)
 * 2. Subdomain: <slug>.auth.example.com
 * 3. Query param: ?tenant=<slug>
 *
 * Sets req.tenant and req.tenantId. Calls next() even when no tenant is found
 * so single-tenant deployments continue working without this middleware configured.
 */
export function resolveTenant(opts: { required?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = extractTenantSlug(req);
      if (!slug) {
        if (opts.required) {
          res
            .status(400)
            .json({ code: "TENANT_REQUIRED", message: "Tenant identifier is required", details: [] });
          return;
        }
        return next();
      }

      const tenant = await TenantModel.findOne({ slug, status: "active" });
      if (!tenant) {
        if (opts.required) {
          res
            .status(404)
            .json({ code: "TENANT_NOT_FOUND", message: `Tenant '${slug}' not found`, details: [] });
          return;
        }
        return next();
      }

      req.tenant = tenant;
      req.tenantId = tenant._id.toString();
      next();
    } catch (err) {
      logger.error("Tenant resolution error", err as Error);
      next(err);
    }
  };
}

/**
 * Middleware that asserts a tenant exists and is active.
 * Must be placed after resolveTenant().
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res
      .status(400)
      .json({ code: "TENANT_REQUIRED", message: "Valid tenant context required", details: [] });
    return;
  }
  next();
}

/**
 * Scoped MongoDB query helper — adds tenantId filter to any query object.
 */
export function withTenant<T extends Record<string, unknown>>(
  req: Request,
  query: T
): T & { tenantId?: string } {
  if (req.tenantId) {
    return { ...query, tenantId: req.tenantId };
  }
  return query;
}

function extractTenantSlug(req: Request): string | null {
  // 1. Explicit header
  const header = req.headers["x-tenant-id"] as string | undefined;
  if (header?.trim()) return header.trim().toLowerCase();

  // 2. Query param
  const qp = req.query["tenant"] as string | undefined;
  if (qp?.trim()) return qp.trim().toLowerCase();

  // 3. Subdomain (e.g. acme.auth.example.com)
  const host = req.hostname || "";
  const parts = host.split(".");
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub && sub !== "www" && sub !== "auth" && sub !== "api") {
      return sub.toLowerCase();
    }
  }

  return null;
}
