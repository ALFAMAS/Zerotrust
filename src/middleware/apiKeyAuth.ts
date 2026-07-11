import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { apiKeysTable, usersTable } from "../db/schema";
import type { HonoEnv, User } from "../shared/types";
import { apiKeyUsageMetric, getUsage, incrementUsage } from "../shared/usageMetering";
import { consumeRateLimit } from "./rateLimiting";

export function requireApiKeyScopes(required: string | string[], mode: "all" | "any" = "all") {
  const requiredScopes = Array.isArray(required) ? required : [required];
  return createMiddleware<HonoEnv>(async (c, next) => {
    const granted = c.get("apiKeyScopes") ?? [];
    const allowed =
      mode === "all"
        ? requiredScopes.every((scope) => granted.includes(scope))
        : requiredScopes.some((scope) => granted.includes(scope));

    if (!allowed) {
      return c.json(
        {
          error: "INSUFFICIENT_SCOPE",
          required: requiredScopes,
          granted,
        },
        403
      );
    }

    return next();
  });
}

export const apiKeyAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization") ?? "";
  const keyRaw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : c.req.header("X-API-Key");

  if (!keyRaw) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  const keyHash = createHash("sha256").update(keyRaw).digest("hex");
  const db = getDb();

  const [row] = await db
    .select({ key: apiKeysTable, user: usersTable })
    .from(apiKeysTable)
    .innerJoin(usersTable, eq(usersTable.id, apiKeysTable.userId))
    .where(and(eq(apiKeysTable.keyHash, keyHash), isNull(apiKeysTable.revokedAt)))
    .limit(1);

  if (!row) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  const { key, user } = row;

  if (key.expiresAt && key.expiresAt < new Date()) {
    return c.json({ error: "API_KEY_EXPIRED" }, 401);
  }

  if (key.rateLimitPerMinute && key.rateLimitPerMinute > 0) {
    const result = await consumeRateLimit(`api-key:${key.id}`, key.rateLimitPerMinute, 60);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSecs));
      return c.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "API key rate limit exceeded",
        },
        429
      );
    }
  }

  const scope = {
    userId: key.orgId ? undefined : key.userId,
    orgId: key.orgId ?? undefined,
  };
  const keyMetric = apiKeyUsageMetric(key.id);
  if (key.monthlyQuota && key.monthlyQuota > 0) {
    const used = await getUsage(keyMetric, scope);
    if (used >= key.monthlyQuota) {
      return c.json(
        {
          error: "API_KEY_QUOTA_EXCEEDED",
          message: "API key monthly quota exceeded",
          used,
          quota: key.monthlyQuota,
        },
        429
      );
    }
  }

  // Update last used timestamp (fire-and-forget)
  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id))
    .catch(() => {});

  // Metered usage: count this API call against the billing period
  void incrementUsage("api_calls", scope);
  void incrementUsage(keyMetric, scope);
  void import("../services/billing/stripeMeter.service.js").then(({ recordStripeMeterEvent }) =>
    recordStripeMeterEvent({
      orgId: key.orgId ?? undefined,
      userId: key.userId,
      metric: "api_calls",
      quantity: 1,
    })
  );

  c.set("user", user as unknown as User);
  c.set("apiKeyId", key.id);
  c.set("apiKeyScopes", key.scopes ?? []);
  // Expose the key's environment so downstream handlers can route test-mode
  // traffic to sandbox data. Defaults to "live" for keys issued before 0006.
  c.set("apiKeyEnvironment", key.environment === "test" ? "test" : "live");
  c.header("X-zerotrust-Environment", key.environment === "test" ? "test" : "live");
  return next();
});
