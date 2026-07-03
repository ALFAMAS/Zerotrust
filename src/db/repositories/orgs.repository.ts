import { and, eq } from "drizzle-orm";
import { getDb } from "..";
import { organizationInvitesTable, organizationMembersTable, organizationsTable } from "../schema";

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

export interface AcceptOrgInviteInput {
  token: string;
  userId: string;
  userEmail: string;
}

export type AcceptOrgInviteResult =
  | {
      ok: true;
      org: { id: string; name: string; slug: string };
      member: { role: string };
    }
  | { ok: false; reason: "not_found" | "expired" | "email_mismatch" };

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

/**
 * Accept an org invite by token in one transaction: validates the invite
 * belongs to the caller's email and hasn't expired/been used, upserts
 * membership (idempotent — a crash after the membership insert but before the
 * invite is marked consumed can't create a duplicate membership or leave the
 * invite re-acceptable), and marks the invite consumed.
 */
export async function acceptOrgInvite(input: AcceptOrgInviteInput): Promise<AcceptOrgInviteResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(organizationInvitesTable)
      .where(eq(organizationInvitesTable.token, input.token))
      .limit(1);

    if (!invite || invite.usedAt) return { ok: false, reason: "not_found" };
    if (invite.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (invite.email.toLowerCase() !== input.userEmail.toLowerCase()) {
      return { ok: false, reason: "email_mismatch" };
    }

    await tx
      .insert(organizationMembersTable)
      .values({
        orgId: invite.orgId,
        userId: input.userId,
        role: invite.role,
        invitedBy: invite.invitedBy,
        joinedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [organizationMembersTable.orgId, organizationMembersTable.userId],
      });

    await tx
      .update(organizationInvitesTable)
      .set({ usedAt: new Date() })
      .where(eq(organizationInvitesTable.id, invite.id));

    const [member] = await tx
      .select({ role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, invite.orgId),
          eq(organizationMembersTable.userId, input.userId)
        )
      )
      .limit(1);

    const [org] = await tx
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, invite.orgId))
      .limit(1);

    if (!org || !member) throw new Error("Failed to accept invite");

    return { ok: true, org, member };
  });
}
