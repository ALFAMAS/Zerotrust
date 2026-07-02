/**
 * Org-level tax exemptions / VAT IDs. Non-profits and B2B EU orgs submit a tax
 * ID or VAT number; EU VAT numbers are format-checked (and, where reachable,
 * VIES-verified) so a verified cross-border B2B supply can be reverse-charged.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { taxExemptionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";
import { isEuCountry, validateVatFormat } from "./globalization.service";

const logger = getLogger("tax-exemption");

export type ExemptionKind = "vat" | "tax_id" | "reverse_charge";
export type ExemptionStatus = "pending" | "verified" | "rejected";

export interface SubmitExemptionInput {
  orgId: string;
  kind: ExemptionKind;
  taxId: string;
  country: string;
  businessName?: string;
  submittedBy: string;
}

/**
 * Submit (or re-submit) a tax exemption for an org. VAT numbers get a format
 * pre-check; a malformed EU VAT number is rejected up front. Re-submitting the
 * same taxId updates the existing record back to `pending`.
 */
export async function submitTaxExemption(input: SubmitExemptionInput) {
  const country = input.country.toUpperCase();
  const taxId = input.taxId.replace(/[\s.-]/g, "").toUpperCase();

  if (input.kind === "vat") {
    const fmt = validateVatFormat(taxId);
    if (!fmt.valid) {
      return { ok: false as const, error: "INVALID_VAT_FORMAT", reason: fmt.reason };
    }
  }

  const db = getDb();
  const [row] = await db
    .insert(taxExemptionsTable)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      taxId,
      country,
      businessName: input.businessName,
      submittedBy: input.submittedBy,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [taxExemptionsTable.orgId, taxExemptionsTable.taxId],
      set: {
        kind: input.kind,
        country,
        businessName: input.businessName,
        status: "pending",
        verifiedAt: null,
        submittedBy: input.submittedBy,
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info("Tax exemption submitted", { orgId: input.orgId, kind: input.kind, country });
  return { ok: true as const, exemption: row };
}

export async function listTaxExemptions(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(taxExemptionsTable)
    .where(eq(taxExemptionsTable.orgId, orgId))
    .orderBy(desc(taxExemptionsTable.createdAt));
}

/** Returns true if the org has at least one verified exemption (tax should be 0). */
export async function hasVerifiedExemption(orgId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: taxExemptionsTable.id })
    .from(taxExemptionsTable)
    .where(and(eq(taxExemptionsTable.orgId, orgId), eq(taxExemptionsTable.status, "verified")))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether a charge to this org should be VAT reverse-charged: a verified EU VAT
 * exemption in a different country than the seller's establishment.
 */
export async function isReverseCharge(orgId: string, sellerCountry: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ country: taxExemptionsTable.country, kind: taxExemptionsTable.kind })
    .from(taxExemptionsTable)
    .where(and(eq(taxExemptionsTable.orgId, orgId), eq(taxExemptionsTable.status, "verified")))
    .limit(1);
  if (!row) return false;
  return (
    row.kind === "vat" && isEuCountry(row.country) && row.country !== sellerCountry.toUpperCase()
  );
}

/** Admin: mark an exemption verified or rejected. */
export async function setExemptionStatus(id: string, status: ExemptionStatus) {
  const db = getDb();
  const [row] = await db
    .update(taxExemptionsTable)
    .set({
      status,
      verifiedAt: status === "verified" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(taxExemptionsTable.id, id))
    .returning();
  return row ?? null;
}
