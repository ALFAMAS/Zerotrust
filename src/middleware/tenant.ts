import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("tenant-middleware");

/**
 * Resolve the current tenant from the request.
 *
 * Resolution order:
 * 1. X-Tenant-ID header (slug)
 * 2. Subdomain: <slug>.auth.example.com
 * 3. Query param: ?tenant=<slug>
 *
 * Stores the tenantId in context via c.set("tenantId", tenantId).
 * Calls next() even when no tenant is found so single-tenant deployments
 * continue working without this middleware configured.
 */
export function resolveTenant() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    try {
      const tenantId = extractTenantSlug(c);
      if (tenantId) {
        c.set("tenantId", tenantId);
      }
      return next();
    } catch (err) {
      logger.error("Tenant resolution error", err as Error);
      return next();
    }
  });
}

/**
 * Middleware that asserts a tenantId has been resolved.
 * Must be placed after resolveTenant().
 */
export const requireTenant = createMiddleware<HonoEnv>(async (c, next) => {
  const tenantId = c.get("tenantId");
  if (!tenantId) {
    return c.json(
      { code: "TENANT_REQUIRED", message: "Valid tenant context required", details: [] },
      401
    );
  }
  return next();
});

function extractTenantSlug(c: Context<HonoEnv>): string | null {
  // 1. Explicit header
  const header = c.req.header("x-tenant-id");
  if (header?.trim()) return header.trim().toLowerCase();

  // 2. Query param
  const qp = c.req.query("tenant");
  if (qp?.trim()) return qp.trim().toLowerCase();

  // 3. Subdomain (e.g. acme.auth.example.com)
  const host = c.req.header("host") ?? "";
  const hostname = host.split(":")[0] ?? "";
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub && sub !== "www" && sub !== "auth" && sub !== "api") {
      return sub.toLowerCase();
    }
  }

  return null;
}
