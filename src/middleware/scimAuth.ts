import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { orgScimTokensTable } from "../db/schema";
import { hashTokenSha256 } from "../shared/cryptoHash";
import type { HonoEnv } from "../shared/types";

export const scimAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Authorization required",
        status: "401",
      },
      401
    );
  }

  const tokenRaw = authHeader.slice(7).trim();
  if (!tokenRaw) {
    return c.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid bearer token",
        status: "401",
      },
      401
    );
  }

  const tokenHash = hashTokenSha256(tokenRaw);
  const db = getDb();
  const [row] = await db
    .select()
    .from(orgScimTokensTable)
    .where(and(eq(orgScimTokensTable.tokenHash, tokenHash), isNull(orgScimTokensTable.revokedAt)))
    .limit(1);

  if (!row) {
    return c.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid SCIM token",
        status: "401",
      },
      401
    );
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return c.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "SCIM token expired",
        status: "401",
      },
      401
    );
  }

  db.update(orgScimTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(orgScimTokensTable.id, row.id))
    .catch(() => {});

  c.set("scimOrgId", row.orgId);
  c.set("scimTokenId", row.id);
  return next();
});
