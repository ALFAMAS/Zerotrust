/**
 * CSRF origin validation for cookie-authenticated browser requests (SEC-7).
 *
 * Bearer/API-key clients and server-to-server webhooks carry no session cookies
 * and are CSRF-immune — they skip this check. State-changing requests from the
 * web UI must present a matching Origin or Referer.
 */

import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
import { corsPolicyFromEnv, resolveCorsOrigin } from "./cors";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths exempt from origin checks (provider callbacks, signed webhooks). */
export const CSRF_EXEMPT_PREFIXES = [
  "/billing/webhook",
  "/webhooks/email/",
  "/ssf/events",
] as const;

function hasBearerAuth(authHeader: string | undefined): boolean {
  return Boolean(authHeader?.startsWith("Bearer "));
}

function hasApiKeyAuth(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer zak_")) return true;
  return Boolean(c.req.header("X-API-Key"));
}

function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)(?:za_refresh_token|__Host-za_refresh_token|za_access_token)=/.test(
    cookieHeader
  );
}

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/** Resolve allowed app origins from env (same trust model as CORS). */
export function trustedOriginsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const policy = corsPolicyFromEnv(env);
  if (policy.allowWildcard) return ["*"];
  if (policy.allowedOrigins.length > 0) return policy.allowedOrigins;
  if (!policy.isProduction) {
    return [
      ...(env.APP_URL ? [env.APP_URL.replace(/\/$/, "")] : []),
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];
  }
  return env.APP_URL ? [env.APP_URL.replace(/\/$/, "")] : [];
}

export function isOriginTrusted(
  origin: string | null | undefined,
  trusted: readonly string[]
): boolean {
  if (!origin) return false;
  if (trusted.includes("*")) return true;
  const normalized = origin.replace(/\/$/, "");
  return trusted.includes(normalized);
}

export function csrfOriginMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const trusted = trustedOriginsFromEnv(env);

  return createMiddleware<HonoEnv>(async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (!STATE_CHANGING.has(method)) return next();

    const path = c.req.path;
    if (isExemptPath(path)) return next();

    // Mobile/API clients: no cookie session CSRF surface.
    if (hasBearerAuth(c.req.header("authorization")) || hasApiKeyAuth(c)) {
      return next();
    }

    // Cookie-less POSTs (curl, vitest) are not browser CSRF vectors.
    if (!hasSessionCookie(c.req.header("cookie"))) {
      return next();
    }

    const requestOrigin = c.req.header("origin") ?? originFromReferer(c.req.header("referer"));
    const policy = corsPolicyFromEnv(env);
    const allowed =
      resolveCorsOrigin(requestOrigin ?? undefined, policy) ??
      (isOriginTrusted(requestOrigin, trusted) ? requestOrigin : null);

    if (!allowed) {
      return c.json(
        { error: "CSRF_ORIGIN_MISMATCH", message: "Origin not allowed for this request" },
        403
      );
    }

    return next();
  });
}
