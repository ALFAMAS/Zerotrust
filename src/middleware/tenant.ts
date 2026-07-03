import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("tenant-middleware");

/**
 * Resolve the current tenant from the request.
 *
 * Resolution order (header/query intentionally excluded — see audit M9):
 * 1. Subdomain: <slug>.auth.example.com
 *
 * Stores the tenantId in context via c.set("tenantId", tenantId).
 * Calls next() even when no tenant is found so single-tenant deployments
 * continue working without this middleware configured.
 *
 * NOT mounted in server.ts today — the live isolation boundary is
 * `organizations` + `organization_members`. If this middleware is wired in the
 * future, it must run after auth and validate that the principal belongs to
 * the resolved tenant; never trust `X-Tenant-ID` or `?tenant=` from anonymous
 * callers.
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
  // Subdomain only (e.g. acme.auth.example.com). X-Tenant-ID / ?tenant= are
  // not trusted here — they would let unauthenticated callers pick a tenant
  // bucket for rate limiting or future row-level filters (audit finding M9).
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
