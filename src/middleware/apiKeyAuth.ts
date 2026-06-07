import { createMiddleware } from "hono/factory";
import { createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { apiKeysTable, usersTable } from "../db/schema";
import type { HonoEnv, User } from "../shared/types";

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

  // Update last used timestamp (fire-and-forget)
  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id))
    .catch(() => {});

  c.set("user", user as unknown as User);
  return next();
});
