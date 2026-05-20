import crypto from "crypto";
import { WorkloadCredentialModel } from "../models";
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

  const rec = await WorkloadCredentialModel.create({
    workloadId,
    workloadSecret: secretHash,
    createdBy,
    scopes,
    ttl: ttlSecs,
    expiresAt,
  });
  logger.info("Workload credential created", { workloadId, id: rec._id.toString() });
  return { id: rec._id.toString(), workloadId, secret: plainSecret, expiresAt };
}

export async function validateWorkloadCredential(workloadId: string, providedSecret: string) {
  const rec = await WorkloadCredentialModel.findOne({
    workloadId,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });
  if (!rec) return false;
  const providedHash = crypto.createHash("sha256").update(providedSecret).digest("hex");
  return providedHash === rec.workloadSecret;
}
