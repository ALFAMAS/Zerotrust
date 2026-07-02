import { eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { orgSecurityPoliciesTable } from "../../db/schema";
import type { AttestationPolicy } from "../../mfa/attestation";

export interface OrgSecurityPolicy {
  orgId: string;
  requirePasskeyAttestation: boolean;
  requireHardwarePasskey: boolean;
  allowedPasskeyAaguids: string[];
  deniedPasskeyAaguids: string[];
  ipAllowlist: string[];
  requireTrustedDevices: boolean;
  updatedAt?: Date;
  updatedBy?: string | null;
}

export function defaultOrgSecurityPolicy(orgId: string): OrgSecurityPolicy {
  return {
    orgId,
    requirePasskeyAttestation: false,
    requireHardwarePasskey: false,
    allowedPasskeyAaguids: [],
    deniedPasskeyAaguids: [],
    ipAllowlist: [],
    requireTrustedDevices: false,
  };
}

export async function getOrgSecurityPolicy(orgId: string): Promise<OrgSecurityPolicy> {
  const db = getDb();
  const [policy] = await db
    .select()
    .from(orgSecurityPoliciesTable)
    .where(eq(orgSecurityPoliciesTable.orgId, orgId))
    .limit(1);

  return policy ? (policy as OrgSecurityPolicy) : defaultOrgSecurityPolicy(orgId);
}

export function toAttestationPolicy(policy: OrgSecurityPolicy): AttestationPolicy {
  return {
    level: policy.requirePasskeyAttestation ? "direct" : "none",
    allowSelfAttestation: !policy.requirePasskeyAttestation,
    requireFidoCertified: policy.requireHardwarePasskey,
    allowedAAGUIDs: policy.allowedPasskeyAaguids,
    deniedAAGUIDs: policy.deniedPasskeyAaguids,
    denyStatuses: ["REVOKED", "USER_KEY_PHYSICAL_COMPROMISE", "ATTESTATION_KEY_COMPROMISE"],
  };
}
