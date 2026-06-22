import crypto from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { workloadCredentialsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("workload");

/**
 * List workload credentials without exposing the (hashed) secret. Ordered
 * newest-first. Powers the admin workload-identity management UI.
 */
export async function listWorkloadCredentials() {
  const db = getDb();
  const rows = await db
    .select({
      id: workloadCredentialsTable.id,
      workloadId: workloadCredentialsTable.workloadId,
      scopes: workloadCredentialsTable.scopes,
      ttl: workloadCredentialsTable.ttl,
      expiresAt: workloadCredentialsTable.expiresAt,
      isRevoked: workloadCredentialsTable.isRevoked,
      createdAt: workloadCredentialsTable.createdAt,
    })
    .from(workloadCredentialsTable)
    .orderBy(desc(workloadCredentialsTable.createdAt));

  const now = new Date();
  return rows.map((r) => ({
    ...r,
    // Derived status so the UI doesn't have to reconcile revoked + expired.
    status: r.isRevoked ? "revoked" : r.expiresAt && r.expiresAt < now ? "expired" : "active",
  }));
}

/**
 * Revoke a workload credential by id. Returns true if a row was updated.
 * Revocation is immediate — `getValidWorkloadCredential` filters on isRevoked.
 */
export async function revokeWorkloadCredential(id: string): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(workloadCredentialsTable)
    .set({ isRevoked: true })
    .where(eq(workloadCredentialsTable.id, id))
    .returning({ id: workloadCredentialsTable.id });
  if (updated.length > 0) {
    logger.info("Workload credential revoked", { id });
  }
  return updated.length > 0;
}

export async function createWorkloadCredential(
  workloadId: string,
  createdBy: string | undefined,
  scopes: string[] = [],
  ttlSecs = 3600
) {
  const plainSecret = crypto.randomBytes(24).toString("hex");
  const secretHash = crypto.createHash("sha256").update(plainSecret).digest("hex");
  const expiresAt = new Date(Date.now() + ttlSecs * 1000);

  const db = getDb();
  const [rec] = await db
    .insert(workloadCredentialsTable)
    .values({
      workloadId,
      workloadSecret: secretHash,
      createdBy: createdBy || null,
      scopes,
      ttl: ttlSecs,
      expiresAt,
    })
    .returning();

  logger.info("Workload credential created", { workloadId, id: rec.id });
  return { id: rec.id, workloadId, secret: plainSecret, scopes, expiresAt };
}

export async function getValidWorkloadCredential(workloadId: string, providedSecret: string) {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select()
    .from(workloadCredentialsTable)
    .where(
      and(
        eq(workloadCredentialsTable.workloadId, workloadId),
        eq(workloadCredentialsTable.isRevoked, false),
        gt(workloadCredentialsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  const providedHash = crypto.createHash("sha256").update(providedSecret).digest("hex");
  return providedHash === rows[0].workloadSecret ? rows[0] : null;
}

export async function validateWorkloadCredential(workloadId: string, providedSecret: string) {
  return (await getValidWorkloadCredential(workloadId, providedSecret)) !== null;
}
