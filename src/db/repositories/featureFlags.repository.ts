import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withOrgRlsRead } from "../rls";
import { orgFeatureFlagsTable } from "../schema";
import { createOrgScopedContext } from "./orgScopedFactory";

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  metadata: Record<string, unknown>;
}

function fromRow(row: typeof orgFeatureFlagsTable.$inferSelect): FeatureFlagRow {
  return {
    key: row.key,
    enabled: row.enabled,
    rolloutPercent: row.rolloutPercent,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function bucketForUser(orgId: string, key: string, userId: string): number {
  const hash = createHash("sha256").update(`${orgId}:${key}:${userId}`).digest();
  return hash[0]! % 100;
}

/**
 * SEC-12 org-scoped feature flags repository. `orgId` is required at construction.
 */
export function featureFlagsRepo(orgId: string) {
  const { orgId: scopedOrgId } = createOrgScopedContext(orgId);

  return {
    orgId: scopedOrgId,

    async get(key: string, userId?: string): Promise<FeatureFlagRow | null> {
      return withOrgRlsRead({ orgId: scopedOrgId, userId }, async (db) => {
        const [row] = await db
          .select()
          .from(orgFeatureFlagsTable)
          .where(
            and(eq(orgFeatureFlagsTable.orgId, scopedOrgId), eq(orgFeatureFlagsTable.key, key))
          )
          .limit(1);
        return row ? fromRow(row) : null;
      });
    },

    async list(userId?: string): Promise<FeatureFlagRow[]> {
      return withOrgRlsRead({ orgId: scopedOrgId, userId }, async (db) => {
        const rows = await db
          .select()
          .from(orgFeatureFlagsTable)
          .where(eq(orgFeatureFlagsTable.orgId, scopedOrgId));
        return rows.map(fromRow);
      });
    },

    async isEnabled(key: string, userId?: string): Promise<boolean> {
      const flag = await this.get(key, userId);
      if (!flag?.enabled) return false;
      if (flag.rolloutPercent >= 100) return true;
      if (flag.rolloutPercent <= 0) return false;
      if (!userId) return true;
      return bucketForUser(scopedOrgId, key, userId) < flag.rolloutPercent;
    },
  };
}

export type FeatureFlagsRepo = ReturnType<typeof featureFlagsRepo>;
