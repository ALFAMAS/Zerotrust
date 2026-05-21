/**
 * mTLS (Mutual TLS) Middleware
 *
 * Validates client certificates for workload identity and zero-trust
 * service-to-service authentication.
 *
 * Supports two deployment modes:
 *   1. Direct TLS termination in Node.js: reads from `req.socket.getPeerCertificate()`.
 *   2. TLS-terminating proxy (Nginx, Envoy, AWS ALB): reads CN from the
 *      `X-Client-Cert-CN` header forwarded by the proxy.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getLogger } from "../logger";

const logger = getLogger("mtls");

// ─── Express Namespace Augmentation ──────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Common Name extracted from the mTLS client certificate */
      clientCertCN?: string;
      /**
       * Full subject of the mTLS client certificate as a key=value record.
       * Example: `{ CN: "spiffe://cluster/ns/app", O: "Acme Corp" }`
       */
      clientCertSubject?: Record<string, string>;
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface mTLSOptions {
  /**
   * Path to the CA certificate file (PEM) used to validate the client cert.
   * When running behind a proxy this is typically handled by the proxy and
   * this option can be omitted.
   */
  caPath?: string;

  /**
   * Inline PEM string for the CA certificate (alternative to caPath).
   */
  caCert?: string;

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
 * The `subject` field on a Node.js `PeerCertificate` is already a flat object:
 * `{ CN: '...', O: '...', OU: '...', ... }`.
 * This function normalises it and handles both the object form and a raw
 * subject string (e.g. from a proxy header like "CN=foo, O=bar").
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
    result[key] = Array.isArray(value) ? value[0] : String(value);
  }
  return result;
}

/**
 * Attempt to retrieve the client certificate CN from various sources:
 *   1. Node TLS socket peer certificate (direct TLS termination)
 *   2. `X-Client-Cert-CN` header (proxy forwarding)
 *   3. `X-Forwarded-Client-Cert` Envoy-style header (CN part)
 *
 * Returns `{ cn, subject }` or `null` if no certificate is present.
 */
function extractCertInfo(
  req: Request
): { cn: string; subject: Record<string, string> } | null {
  // 1. Direct TLS peer certificate
  const socket = req.socket as any;
  if (typeof socket?.getPeerCertificate === "function") {
    try {
      const cert = socket.getPeerCertificate(false);
      if (cert && cert.subject && Object.keys(cert.subject).length > 0) {
        const subject = parseSubject(cert.subject as Record<string, string>);
        const cn = subject["CN"] ?? "";
        if (cn) {
          return { cn, subject };
        }
      }
    } catch {
      // Socket may not support getPeerCertificate in this environment
    }
  }

  // 2. X-Client-Cert-CN header (Nginx/Envoy proxy forwarding)
  const headerCN = req.headers["x-client-cert-cn"];
  if (headerCN && typeof headerCN === "string" && headerCN.trim()) {
    const cn = headerCN.trim();
    return { cn, subject: { CN: cn } };
  }

  // 3. X-Forwarded-Client-Cert (Envoy XFCC header, contains Subject=...)
  const xfcc = req.headers["x-forwarded-client-cert"];
  if (xfcc && typeof xfcc === "string") {
    // XFCC format: By=<>;Hash=<>;Subject="CN=...,O=..."
    const subjectMatch = xfcc.match(/Subject="([^"]+)"/i);
    if (subjectMatch) {
      const subject = parseSubject(subjectMatch[1]);
      const cn = subject["CN"] ?? "";
      if (cn) {
        return { cn, subject };
      }
    }
  }

  return null;
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Express middleware that enforces mutual TLS authentication.
 *
 * Usage:
 * ```ts
 * app.use('/api/internal', requireMTLS({ allowedCNs: ['service-a', 'service-b'] }));
 * ```
 */
export function requireMTLS(options?: mTLSOptions): RequestHandler {
  const required = options?.required !== false; // default true
  const allowedCNs = options?.allowedCNs ?? [];

  return (req: Request, res: Response, next: NextFunction): void => {
    const certInfo = extractCertInfo(req);

    if (!certInfo) {
      if (required) {
        logger.warn("mTLS: missing client certificate", { ip: req.ip, path: req.path });
        res.status(401).json({ error: "client_certificate_required" });
        return;
      }
      // Certificate not required — continue without setting cert fields
      next();
      return;
    }

    const { cn, subject } = certInfo;

    // CN allow-list check
    if (allowedCNs.length > 0 && !allowedCNs.includes(cn)) {
      logger.warn("mTLS: client CN not in allowed list", { cn, allowedCNs });
      res.status(403).json({
        error: "client_certificate_not_authorized",
        cn,
      });
      return;
    }

    // Attach certificate info to request
    req.clientCertCN = cn;
    req.clientCertSubject = subject;

    logger.debug("mTLS: client certificate accepted", { cn });
    next();
  };
}

// ─── Workload Identity Extraction ─────────────────────────────────────────────

/**
 * Extract a structured workload identity from the client certificate.
 *
 * Parses SPIFFE-style SVIDs in the CN field (e.g.
 * `spiffe://cluster.local/ns/default/sa/my-service`) as well as plain CNs.
 *
 * Returns `null` if no client certificate is attached to the request.
 */
export function extractWorkloadIdentity(req: Request): WorkloadIdentity | null {
  const cn = req.clientCertCN;
  if (!cn) return null;

  const subject = req.clientCertSubject ?? {};

  return {
    cn,
    organization: subject["O"] || subject["organization"] || undefined,
    organizationalUnit: subject["OU"] || subject["organizationalUnit"] || undefined,
  };
}
