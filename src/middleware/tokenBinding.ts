/**
 * Token Binding Middleware (RFC 8471 / RFC 8473)
 *
 * Ties a token to the TLS session fingerprint so a stolen token is useless
 * outside its original TLS connection.  Because most deployments terminate
 * TLS at a proxy, a header-based fallback is supported via `x-token-binding-id`.
 *
 * The token's `tbh` (token-binding hash) claim is compared against the
 * `x-token-binding-id` header forwarded by the proxy.
 *
 * In strict mode a mismatch is rejected (403); in relaxed mode a warning is
 * emitted and the request continues.
 */

import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("token-binding");

// ─── Constants ────────────────────────────────────────────────────────────────

export const TOKEN_BINDING_HEADER = "x-token-binding-id";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenBindingOptions {
  /**
   * strict  – reject (403) requests with a mismatched binding
   * relaxed – log a warning but allow the request through (default)
   */
  strict?: boolean;
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Hono middleware that verifies the token-binding hash (`tbh`) claim
 * carried in the token payload against the `x-token-binding-id` proxy header.
 *
 * Reads the decoded token from `c.get("token")` (populated by upstream auth
 * middleware).  If the token has no `tbh` claim, the check is skipped.
 *
 * Usage:
 * ```ts
 * app.use('/api', tokenBindingMiddleware({ strict: true }));
 * ```
 */
export function tokenBindingMiddleware(opts?: TokenBindingOptions) {
  const strict = opts?.strict ?? false;

  return createMiddleware<HonoEnv>(async (c, next) => {
    // Retrieve the decoded token payload set by upstream auth middleware
    const token = c.get("token");

    // No token or no tbh claim — nothing to verify
    if (!token || !("tbh" in token)) {
      return next();
    }

    const tbhClaim = (token as Record<string, unknown>).tbh;
    if (typeof tbhClaim !== "string") {
      return next();
    }

    // Read the binding ID forwarded by the proxy / TLS-terminating layer
    const bindingId = c.req.header(TOKEN_BINDING_HEADER);

    if (!bindingId) {
      // Cannot verify — no binding material available (e.g. plain HTTP in dev)
      logger.warn("Token binding: cannot determine binding ID for current request", {
        path: c.req.path,
        strict,
      });
      return next();
    }

    if (bindingId !== tbhClaim) {
      logger.warn("Token binding: binding ID mismatch", {
        expected: tbhClaim,
        actual: bindingId,
        path: c.req.path,
        strict,
      });

      if (strict) {
        return c.json(
          {
            error: "token_binding_mismatch",
            message: "Token binding verification failed: binding ID does not match this connection",
          },
          403
        );
      }
      // relaxed — warning already emitted, fall through
      return next();
    }

    logger.debug("Token binding: verified successfully", { path: c.req.path });
    return next();
  });
}
