import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";
import { ErrorCodes } from "../shared/types";

const logger = getLogger("proof-of-possession");

const nonceCache: Map<string, number> = new Map();

function cleanupNonces() {
  const now = Date.now();
  for (const [k, v] of nonceCache.entries()) {
    if (v < now) nonceCache.delete(k);
  }
}

setInterval(cleanupNonces, 60 * 1000).unref();

export function requireProofOfPossession() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    try {
      const token = c.get("token");
      if (!token?.pop_key) return next();

      const clientPop = c.req.header("x-pop-key") || "";
      const nonce = c.req.header("x-pop-nonce") || "";

      if (!clientPop || !nonce) {
        return c.json(
          { error: ErrorCodes.TOKEN_INVALID, message: "Proof-of-possession required" },
          401
        );
      }

      const expiry = nonceCache.get(nonce);
      if (expiry && expiry > Date.now()) {
        logger.warn("Replay detected for PoP nonce", { nonce });
        return c.json({ error: ErrorCodes.TOO_MANY_ATTEMPTS, message: "Invalid PoP nonce" }, 401);
      }

      if (clientPop !== token.pop_key) {
        logger.warn("PoP key mismatch");
        return c.json(
          { error: ErrorCodes.TOKEN_INVALID, message: "Proof-of-possession mismatch" },
          401
        );
      }

      nonceCache.set(nonce, Date.now() + 5 * 60 * 1000);
      c.set("popVerified", true);
      return next();
    } catch (err) {
      logger.error("PoP middleware error", err as Error);
      return c.json({ error: ErrorCodes.INTERNAL_ERROR, message: "PoP validation failed" }, 500);
    }
  });
}

export function clearPoPNonces(): void {
  nonceCache.clear();
}
