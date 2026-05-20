/**
 * Proof-of-Possession (PoP) middleware
 * Lightweight enforcement: compares token `pop_key` with client-provided PoP header.
 * Also enforces nonce replay protection with an in-memory cache.
 */

import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../logger";
import { ErrorCodes, ZeroAuthError } from "../shared/types";

const logger = getLogger("proof-of-possession");

// Simple nonce cache with expiry (in-memory). Map<nonce, expiryEpochMs>
const nonceCache: Map<string, number> = new Map();

function cleanupNonces() {
  const now = Date.now();
  for (const [k, v] of nonceCache.entries()) {
    if (v < now) nonceCache.delete(k);
  }
}

setInterval(cleanupNonces, 60 * 1000).unref();

/**
 * Middleware to validate PoP. Expects:
 * - `req.token.pop_key` to be present (set during token issuance)
 * - header `x-pop-key` containing the client's public key (string)
 * - header `x-pop-nonce` containing a one-time nonce to prevent replays
 */
export function requireProofOfPossession() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // If no token or no pop_key set, skip PoP enforcement
      const token = req.token as any;
      if (!token || !token.pop_key) {
        return next();
      }

      const clientPop = (req.headers["x-pop-key"] as string) || "";
      const nonce = (req.headers["x-pop-nonce"] as string) || "";

      if (!clientPop || !nonce) {
        res
          .status(401)
          .json({ error: ErrorCodes.TOKEN_INVALID, message: "Proof-of-possession required" });
        return;
      }

      // Replay protection: ensure nonce unused and recent
      const expiry = nonceCache.get(nonce);
      if (expiry && expiry > Date.now()) {
        // Nonce already used
        logger.warn("Replay detected for PoP nonce", { nonce, ip: req.ip });
        res.status(401).json({ error: ErrorCodes.TOO_MANY_ATTEMPTS, message: "Invalid PoP nonce" });
        return;
      }

      // Simple string equality check between token pop_key and presented key
      if (clientPop !== token.pop_key) {
        logger.warn("PoP key mismatch", {
          expected: token.pop_key?.slice?.(0, 8),
          got: clientPop?.slice?.(0, 8),
        });
        res
          .status(401)
          .json({ error: ErrorCodes.TOKEN_INVALID, message: "Proof-of-possession mismatch" });
        return;
      }

      // Mark nonce as used for 5 minutes
      nonceCache.set(nonce, Date.now() + 5 * 60 * 1000);

      // Attach PoP verified flag
      (req as any).popVerified = true;

      next();
    } catch (err) {
      logger.error("PoP middleware error", err as Error);
      res.status(500).json({ error: ErrorCodes.INTERNAL_ERROR, message: "PoP validation failed" });
    }
  };
}

/** Testing helper to clear nonce cache */
export function clearPoPNonces(): void {
  nonceCache.clear();
}
