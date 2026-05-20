import type { Request, Response, NextFunction } from "express";

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

  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Strict-Transport-Security", hsts);
    res.setHeader("X-Frame-Options", frameOptions);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", referrerPolicy);
    res.setHeader("Permissions-Policy", permissionsPolicy);
    res.setHeader("X-XSS-Protection", "0");
    res.removeHeader("X-Powered-By");
    next();
  };
}
