import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db";
import { workloadCredentialsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("workload");

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
        gt(workloadCredentialsTable.expiresAt!, now)
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
