import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { countRows } from "../../shared/dbCount";
import type { PaginationParams } from "../../shared/pagination";
import {
  organizationInvitesTable,
  organizationMembersTable,
  organizationsTable,
  usersTable,
} from "../schema";
import { readDb, writeDb } from "./dbConnections";

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

const pendingInviteConditions = [
  isNull(organizationInvitesTable.usedAt),
  gt(organizationInvitesTable.expiresAt, new Date()),
] as const;

/** List organizations the user belongs to (read replica). */
export async function listOrganizationsForUser(userId: string) {
  const db = readDb();
  return db
    .select({ member: organizationMembersTable, org: organizationsTable })
    .from(organizationMembersTable)
    .innerJoin(organizationsTable, eq(organizationMembersTable.orgId, organizationsTable.id))
    .where(eq(organizationMembersTable.userId, userId));
}

/** Paginated org members with user profile fields (read replica). */
export async function listOrgMembers(orgId: string, pagination: PaginationParams) {
  const db = readDb();
  const where = eq(organizationMembersTable.orgId, orgId);
  const [members, total] = await Promise.all([
    db
      .select({
        member: organizationMembersTable,
        user: {
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(organizationMembersTable)
      .innerJoin(usersTable, eq(organizationMembersTable.userId, usersTable.id))
      .where(where)
      .orderBy(desc(organizationMembersTable.joinedAt))
      .offset(pagination.offset)
      .limit(pagination.limit),
    countRows(db, organizationMembersTable, where),
  ]);
  return { members, total };
}

/** Paginated pending org invites (read replica). */
export async function listOrgInvites(orgId: string, pagination: PaginationParams) {
  const db = readDb();
  const where = and(eq(organizationInvitesTable.orgId, orgId), ...pendingInviteConditions);
  const [invites, total] = await Promise.all([
    db
      .select()
      .from(organizationInvitesTable)
      .where(where)
      .orderBy(desc(organizationInvitesTable.createdAt))
      .offset(pagination.offset)
      .limit(pagination.limit),
    countRows(db, organizationInvitesTable, where),
  ]);
  return { invites, total };
}

/** Pending invites addressed to the caller's email (read replica). */
export async function listPendingInvitesForEmail(email: string, pagination: PaginationParams) {
  const db = readDb();
  const where = and(
    eq(organizationInvitesTable.email, email.toLowerCase()),
    ...pendingInviteConditions
  );
  const [invites, total] = await Promise.all([
    db
      .select({
        invite: organizationInvitesTable,
        org: {
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
        },
      })
      .from(organizationInvitesTable)
      .innerJoin(organizationsTable, eq(organizationInvitesTable.orgId, organizationsTable.id))
      .where(where)
      .orderBy(desc(organizationInvitesTable.createdAt))
      .offset(pagination.offset)
      .limit(pagination.limit),
    countRows(db, organizationInvitesTable, where),
  ]);
  return { invites, total };
}

/**
 * Create the organization and its owner membership atomically so a crash between
 * the two writes cannot leave an ownerless organization.
 */
export async function createOrganizationWithOwner(input: CreateOrganizationWithOwnerInput) {
  const db = writeDb();
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
  const db = writeDb();
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
  const db = writeDb();
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
