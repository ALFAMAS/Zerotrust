/**
 * mTLS (Mutual TLS) Middleware
 *
 * Validates client certificates for workload identity and zero-trust
 * service-to-service authentication.
 *
 * Supports two deployment modes:
 *   1. TLS-terminating proxy (Nginx, Envoy, AWS ALB): reads CN from the
 *      `X-Client-Cert-CN` header forwarded by the proxy.
 *   2. X-Forwarded-Client-Cert Envoy XFCC format.
 *   3. X-SSL-Client-Cert header (raw PEM forwarded by proxy).
 */

import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("mtls");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface mTLSOptions {
  /**
   * Whether a client certificate is mandatory.
   * Defaults to `true`.
   */
  required?: boolean;

  /**
   * If provided, only certificates whose Subject CN is in this list are
   * accepted. An empty array means "allow any CN" (same as not providing
   * the option).
   */
  allowedCNs?: string[];
}

export interface WorkloadIdentity {
  cn: string;
  organization?: string;
  organizationalUnit?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the subject of a TLS peer certificate object (from Node.js tls module)
 * into a plain Record.
 *
 * Handles both the object form and a raw subject string
 * (e.g. from a proxy header like "CN=foo, O=bar").
 */
function parseSubject(
  raw: Record<string, string | string[]> | string | undefined | null
): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "string") {
    // Parse "CN=foo, O=bar, OU=baz" style strings
    const result: Record<string, string> = {};
    for (const part of raw.split(",")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  }
  // Node.js TLS subject object — values can be arrays for multi-value fields
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = Array.isArray(value) ? (value[0] ?? "") : String(value);
  }
  return result;
}

/**
 * Attempt to retrieve the client certificate CN from proxy-forwarded headers:
 *   1. `x-client-cert-cn` header (Nginx/Envoy proxy forwarding)
 *   2. `x-forwarded-client-cert` Envoy-style XFCC header (Subject= part)
 *   3. `x-ssl-client-cert` raw PEM forwarded by proxy (CN extracted from subject)
 *
 * Returns `{ cn, subject }` or `null` if no certificate is present.
 */
function extractCertInfo(
  getHeader: (name: string) => string | undefined
): { cn: string; subject: Record<string, string> } | null {
  // 1. X-Client-Cert-CN header (Nginx/Envoy proxy forwarding)
  const headerCN = getHeader("x-client-cert-cn");
  if (headerCN?.trim()) {
    const cn = headerCN.trim();
    return { cn, subject: { CN: cn } };
  }

  // 2. X-Forwarded-Client-Cert (Envoy XFCC header, contains Subject=...)
  const xfcc = getHeader("x-forwarded-client-cert");
  if (xfcc) {
    // XFCC format: By=<>;Hash=<>;Subject="CN=...,O=..."
    const subjectMatch = xfcc.match(/Subject="([^"]+)"/i);
    if (subjectMatch?.[1]) {
      const subject = parseSubject(subjectMatch[1]);
      const cn = subject.CN ?? "";
      if (cn) {
        return { cn, subject };
      }
    }
  }

  // 3. X-SSL-Client-Cert (raw PEM or DN string from proxy)
  const sslCert = getHeader("x-ssl-client-cert");
  if (sslCert?.trim()) {
    // Try to parse as a DN string (CN=...,O=...)
    const subject = parseSubject(sslCert.trim());
    const cn = subject.CN ?? "";
    if (cn) {
      return { cn, subject };
    }
  }

  return null;
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Hono middleware that enforces mutual TLS authentication.
 *
 * Reads client certificate information from proxy-forwarded headers and
 * optionally validates the CN against an allowlist.
 *
 * The resolved CN is logged; use downstream handlers to enforce identity.
 *
 * Usage:
 * ```ts
 * app.use('/api/internal', mtlsMiddleware({ allowedCNs: ['service-a', 'service-b'] }));
 * ```
 */
export function mtlsMiddleware(options?: mTLSOptions) {
  const required = options?.required !== false; // default true
  const allowedCNs = options?.allowedCNs ?? [];

  return createMiddleware<HonoEnv>(async (c, next) => {
    const certInfo = extractCertInfo((name) => c.req.header(name));

    if (!certInfo) {
      if (required) {
        logger.warn("mTLS: missing client certificate", {
          path: c.req.path,
        });
        return c.json({ error: "client_certificate_required" }, 401);
      }
      // Certificate not required — continue without cert context
      return next();
    }

    const { cn } = certInfo;

    // CN allow-list check
    if (allowedCNs.length > 0 && !allowedCNs.includes(cn)) {
      logger.warn("mTLS: client CN not in allowed list", { cn, allowedCNs });
      return c.json(
        {
          error: "client_certificate_not_authorized",
          cn,
        },
        403
      );
    }

    logger.debug("mTLS: client certificate accepted", { cn });
    return next();
  });
}
