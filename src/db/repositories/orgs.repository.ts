import { and, eq } from "drizzle-orm";
import { getDb } from "..";
import { organizationMembersTable, organizationsTable } from "../schema";

export interface CreateOrganizationWithOwnerInput {
  name: string;
  slug: string;
  ownerId: string;
}

export interface TransferOrganizationOwnershipInput {
  orgId: string;
  currentOwnerId: string;
  newOwnerId: string;
}

/**
 * Create the organization and its owner membership atomically so a crash between
 * the two writes cannot leave an ownerless organization.
 */
export async function createOrganizationWithOwner(input: CreateOrganizationWithOwnerInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [createdOrg] = await tx
      .insert(organizationsTable)
      .values({ name: input.name, slug: input.slug, ownerId: input.ownerId })
      .returning({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        ownerId: organizationsTable.ownerId,
        createdAt: organizationsTable.createdAt,
        updatedAt: organizationsTable.updatedAt,
      });
    if (!createdOrg) throw new Error("Failed to create organization");

    await tx.insert(organizationMembersTable).values({
      orgId: createdOrg.id,
      userId: input.ownerId,
      role: "owner",
      joinedAt: new Date(),
    });

    return createdOrg;
  });
}

/**
 * Transfer ownership by updating the org row and both member roles in one
 * transaction; callers perform authorization and target-member validation.
 */
export async function transferOrganizationOwnership(input: TransferOrganizationOwnershipInput) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(organizationsTable)
      .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
      .where(eq(organizationsTable.id, input.orgId));

    await tx
      .update(organizationMembersTable)
      .set({ role: "admin" })
      .where(
        and(
          eq(organizationMembersTable.orgId, input.orgId),
          eq(organizationMembersTable.userId, input.currentOwnerId)
        )
      );

    await tx
      .update(organizationMembersTable)
      .set({ role: "owner" })
      .where(
        and(
          eq(organizationMembersTable.orgId, input.orgId),
          eq(organizationMembersTable.userId, input.newOwnerId)
        )
      );
  });
}
