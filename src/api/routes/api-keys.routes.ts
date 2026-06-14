import { Hono } from "hono";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { apiKeysTable, organizationMembersTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("api-keys-routes");

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().max(50)).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  orgId: z.string().uuid().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(60_000).optional(),
  monthlyQuota: z.number().int().min(1).max(2_000_000_000).optional(),
});

// GET /api-keys
router.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();

  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      scopes: apiKeysTable.scopes,
      orgId: apiKeysTable.orgId,
      rateLimitPerMinute: apiKeysTable.rateLimitPerMinute,
      monthlyQuota: apiKeysTable.monthlyQuota,
      expiresAt: apiKeysTable.expiresAt,
      lastUsedAt: apiKeysTable.lastUsedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.userId, user.id), isNull(apiKeysTable.revokedAt)));

  return c.json(keys);
});

// POST /api-keys
router.post("/", authMiddleware, rateLimit({ points: 20, windowSecs: 3600 }), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  const rawKey = `zak_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
    : null;

  try {
    const db = getDb();
    if (parsed.data.orgId) {
      const [member] = await db
        .select({ role: organizationMembersTable.role })
        .from(organizationMembersTable)
        .where(
          and(
            eq(organizationMembersTable.orgId, parsed.data.orgId),
            eq(organizationMembersTable.userId, user.id)
          )
        )
        .limit(1);
      if (!member || !["owner", "admin"].includes(member.role)) {
        return c.json(
          { error: "FORBIDDEN", message: "Only org admins can create org API keys" },
          403
        );
      }
    }

    const [entry] = await db
      .insert(apiKeysTable)
      .values({
        userId: user.id,
        orgId: parsed.data.orgId ?? null,
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        scopes: parsed.data.scopes ?? [],
        rateLimitPerMinute: parsed.data.rateLimitPerMinute ?? null,
        monthlyQuota: parsed.data.monthlyQuota ?? null,
        expiresAt,
      })
      .returning();

    logger.info("API key created", { userId: user.id, keyId: entry.id });
    return c.json({ ...entry, key: rawKey }, 201);
  } catch (err) {
    logger.error("Create API key error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /api-keys/:id
router.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const db = getDb();

  const [key] = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(
      and(eq(apiKeysTable.id, id), eq(apiKeysTable.userId, user.id), isNull(apiKeysTable.revokedAt))
    );

  if (!key) return c.json({ error: "NOT_FOUND" }, 404);

  await db.update(apiKeysTable).set({ revokedAt: new Date() }).where(eq(apiKeysTable.id, id));

  logger.info("API key revoked", { userId: user.id, keyId: id });
  return c.json({ success: true });
});

export default router;
