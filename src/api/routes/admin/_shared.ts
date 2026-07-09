import { and, eq, ne, sql } from "drizzle-orm";
import type { getDb } from "../../../db";
import { usersTable } from "../../../db/schema";
import { getLogger } from "../../../logger";
import { countRows } from "../../../shared/dbCount";

export const logger = getLogger("admin-routes");

export async function wouldOrphanAdmins(
  db: ReturnType<typeof getDb>,
  targetId: string
): Promise<boolean> {
  const remainingActiveAdmins = await countRows(
    db,
    usersTable,
    and(
      ne(usersTable.id, targetId),
      eq(usersTable.status, "active"),
      sql`'admin' = ANY(${usersTable.roles})`
    )
  );
  return remainingActiveAdmins === 0;
}
