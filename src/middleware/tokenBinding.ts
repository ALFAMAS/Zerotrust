/**
 * Token Binding Middleware (RFC 8471 / RFC 8473)
 *
 * Ties a token to the TLS session fingerprint so a stolen token is useless
 * outside its original TLS connection.  Because most deployments terminate
 * TLS at a proxy, a header-based fallback is also supported.
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../logger";

const logger = getLogger("token-binding");

// ─── Constants ────────────────────────────────────────────────────────────────

export const TOKEN_BINDING_HEADER = "Sec-Token-Binding";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenBindingConfig {
  /**
   * strict  – reject requests with a mismatched binding (401)
   * relaxed – log a warning but allow the request through
   * disabled – skip token-binding checks entirely
   */
  mode: "strict" | "relaxed" | "disabled";
  /**
   * Request header carrying the RFC 8473 token-binding message.
   * Defaults to "Sec-Token-Binding".
   */
  headerName?: string;
  /**
   * Proxy-forwarded header set by a TLS-terminating proxy that already
   * resolved the binding ID (e.g. "X-Token-Binding-ID").
   */
  proxyHeader?: string;
}

// ─── Token Binding ID Computation ────────────────────────────────────────────

/**
 * Derive a token binding ID from the current TLS session / request headers.
 *
 * Sources are tried in priority order:
 *   1. mTLS peer certificate (direct TLS termination)
 *   2. Sec-Token-Binding header (RFC 8473 base64url-encoded message)
 *   3. X-Token-Binding-ID proxy-forwarded header
 *   4. TLS session ID via the raw socket
 *
 * Returns the SHA-256 hex digest of the binding material, or `null` when
 * no binding material is available.
 */
export function computeTokenBindingId(req: Request): string | null {
  const socket = req.socket as NodeJS.Socket & {
    getPeerCertificate?: (detailed?: boolean) => { raw?: Buffer; fingerprint256?: string };
    getSession?: () => Buffer | null;
  };

  // 1. mTLS peer certificate fingerprint
  if (typeof socket?.getPeerCertificate === "function") {
    try {
      const cert = socket.getPeerCertificate(false);
      if (cert?.raw) {
        return crypto.createHash("sha256").update(cert.raw).digest("hex");
      }
      if (cert?.fingerprint256) {
        // fingerprint256 is already a SHA-256 hex string (colon-separated)
        const normalised = cert.fingerprint256.replace(/:/g, "").toLowerCase();
        return normalised;
      }
    } catch {
      // Socket may not support getPeerCertificate in this environment
    }
  }

  // 2. Sec-Token-Binding header (RFC 8473 base64url-encoded TokenBindingMessage)
  const tbHeader = req.headers[TOKEN_BINDING_HEADER.toLowerCase()];
  if (tbHeader && typeof tbHeader === "string" && tbHeader.trim()) {
    try {
      const raw = Buffer.from(tbHeader.trim(), "base64url");
      return crypto.createHash("sha256").update(raw).digest("hex");
    } catch {
      // Invalid base64url — try next source
    }
  }

  // 3. Proxy-forwarded binding ID header (e.g. X-Token-Binding-ID)
  const proxyHeader = req.headers["x-token-binding-id"];
  if (proxyHeader && typeof proxyHeader === "string" && proxyHeader.trim()) {
    const raw = Buffer.from(proxyHeader.trim(), "utf8");
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  // 4. TLS session ID (raw socket)
  if (typeof socket?.getSession === "function") {
    try {
      const session = socket.getSession();
      if (session && session.length > 0) {
        return crypto.createHash("sha256").update(session).digest("hex");
      }
    } catch {
      // Not a TLS socket or session not available
    }
  }

  return null;
}

// ─── Token Issuance Helper ────────────────────────────────────────────────────

/**
 * Attach a token-binding hash (`tbh`) claim to the token payload during
 * issuance.  Follows the key name convention from RFC 8471 §3.
 *
 * The `tbh` value is the SHA-256 hex of the computed binding ID.  When no
 * binding material is available the payload is returned unchanged.
 */
export function attachTokenBinding(
  payload: Record<string, unknown>,
  req: Request
): Record<string, unknown> {
  const bindingId = computeTokenBindingId(req);
  if (bindingId === null) {
    return payload;
  }
  // tbh = token-binding hash (SHA-256 of the binding ID)
  return { ...payload, tbh: bindingId };
}

// ─── Verification Middleware ──────────────────────────────────────────────────

/**
 * Express middleware that verifies the token-binding hash (`tbh`) claim
 * carried in the token payload against the current TLS session / proxy header.
 *
 * Reads the decoded token from `req.tokenPayload` (populated by the auth
 * middleware upstream).
 *
 * Behaviour controlled by `config.mode`:
 *   strict  – 401 on mismatch
 *   relaxed – warn and continue on mismatch
 *   disabled – skip all checks
 */
export function verifyTokenBinding(
  config?: TokenBindingConfig
): (req: Request, res: Response, next: NextFunction) => void {
  const effectiveConfig = config ?? createTokenBindingConfig();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip entirely when disabled
    if (effectiveConfig.mode === "disabled") {
      next();
      return;
    }

    // Retrieve the decoded token payload (set by upstream auth middleware)
    const tokenPayload = (req as Request & { tokenPayload?: Record<string, unknown> })
      .tokenPayload;

    // Also check req.token (ZeroAuth convention from auth middleware)
    const payload =
      tokenPayload ??
      (req as Request & { token?: Record<string, unknown> }).token ??
      null;

    if (!payload || typeof payload.tbh !== "string") {
      // No tbh claim — nothing to verify
      next();
      return;
    }

    const currentId = computeTokenBindingId(req);
    if (currentId === null) {
      // We cannot compute a binding ID for this request (e.g. plain HTTP in
      // dev).  In strict mode we warn; relaxed / disabled continue normally.
      logger.warn("Token binding: cannot compute binding ID for current request", {
        path: req.path,
        mode: effectiveConfig.mode,
      });
      next();
      return;
    }

    if (currentId !== payload.tbh) {
      logger.warn("Token binding: binding ID mismatch", {
        expected: payload.tbh,
        actual: currentId,
        path: req.path,
        mode: effectiveConfig.mode,
      });

      if (effectiveConfig.mode === "strict") {
        res.status(401).json({
          error: "token_binding_mismatch",
          message: "Token binding verification failed: binding ID does not match this connection",
        });
        return;
      }
      // relaxed — log already emitted above, fall through
    } else {
      logger.debug("Token binding: verified successfully", { path: req.path });
    }

    next();
  };
}

// ─── Config Factory ───────────────────────────────────────────────────────────

/**
 * Create a `TokenBindingConfig` with sensible defaults.
 *
 * Defaults to "relaxed" mode so existing deployments are not broken when
 * token binding is first introduced.
 */
export function createTokenBindingConfig(
  mode: "strict" | "relaxed" | "disabled" = "relaxed"
): TokenBindingConfig {
  return {
    mode,
    headerName: TOKEN_BINDING_HEADER,
    proxyHeader: "X-Token-Binding-ID",
  };
}
