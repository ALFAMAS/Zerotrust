import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";

export interface SecurityHeadersOptions {
  cspDirectives?: Record<string, string | string[]>;
  hstsMaxAge?: number;
  hstsIncludeSubDomains?: boolean;
  frameOptions?: "DENY" | "SAMEORIGIN";
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function securityHeaders(opts: SecurityHeadersOptions = {}) {
  const {
    hstsMaxAge = 63072000,
    hstsIncludeSubDomains = true,
    frameOptions = "DENY",
    referrerPolicy = "strict-origin-when-cross-origin",
    permissionsPolicy = "camera=(), microphone=(), geolocation=(), payment=()",
  } = opts;

  const csp = opts.cspDirectives
    ? Object.entries(opts.cspDirectives)
        .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(" ") : v}`)
        .join("; ")
    : DEFAULT_CSP;

  const hsts = `max-age=${hstsMaxAge}${hstsIncludeSubDomains ? "; includeSubDomains" : ""}; preload`;

  return createMiddleware<HonoEnv>(async (c, next) => {
    c.header("Content-Security-Policy", csp);
    c.header("Strict-Transport-Security", hsts);
    c.header("X-Frame-Options", frameOptions);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", referrerPolicy);
    c.header("Permissions-Policy", permissionsPolicy);
    c.header("X-XSS-Protection", "0");
    return next();
  });
}
