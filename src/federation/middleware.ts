import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types.js";
import { getProvider } from "./registry.js";
import { verifySubjectToken } from "./verify.js";
import { getDb } from "../db/index.js";
import { usersTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getLogger } from "../logger/index.js";

const logger = getLogger("federation-middleware");

export interface FederatedIdentityOptions {
  allowLocal?: boolean;
}

export function requireFederatedIdentity(opts: FederatedIdentityOptions = {}) {
  const allowLocal = opts.allowLocal !== false;

  return createMiddleware<HonoEnv>(async (c, next) => {
    const providerId = c.req.header("x-federation-provider");

    if (!providerId) {
      if (allowLocal) return next();
      return c.json(
        { error: "FEDERATION_REQUIRED", message: "x-federation-provider header required" },
        401
      );
    }

    const authHeader = c.req.header("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return c.json({ error: "UNAUTHORIZED", message: "Bearer token required" }, 401);
    }
    const token = authHeader.slice(7);

    const provider = getProvider(providerId);
    if (!provider || !provider.enabled) {
      return c.json(
        { error: "UNKNOWN_PROVIDER", message: "Federation provider not found or disabled" },
        401
      );
    }

    try {
      const claim = await verifySubjectToken(token, provider);
      if (!claim.email) {
        return c.json({ error: "NO_EMAIL", message: "Provider did not supply an email" }, 401);
      }

      const db = getDb();
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, claim.email.toLowerCase()))
        .limit(1);
      if (rows.length === 0) {
        return c.json(
          { error: "USER_NOT_FOUND", message: "No local user for federated identity" },
          401
        );
      }

      c.set("user", rows[0] as any);
    } catch (err) {
      logger.warn("Federated identity verification failed", { providerId, error: String(err) });
      return c.json({ error: "FEDERATION_VERIFY_FAILED", message: String(err) }, 401);
    }

    return next();
  });
}
