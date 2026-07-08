import { and, eq, inArray } from "drizzle-orm";
import { hashTokenSha256 } from "../../shared/cryptoHash";
import type { User } from "../../shared/types";
import { getDb } from "..";
import { verifyOrgMembership } from "../orgMembership";
import { refreshTokensTable, sessionsTable, usersTable } from "../schema";

export type RefreshSessionInsert = typeof sessionsTable.$inferInsert;
export type RefreshTokenReplacementInsert = Omit<
  typeof refreshTokensTable.$inferInsert,
  "sessionId"
>;

export interface RotateRefreshTokenInput {
  oldRefreshTokenId: string;
  session: RefreshSessionInsert;
  refreshToken: RefreshTokenReplacementInsert;
}

export interface CreateAuthenticatedSessionInput {
  userId: string;
  session: RefreshSessionInsert;
  refreshToken: RefreshTokenReplacementInsert;
}

export interface CreateImpersonationSessionInput {
  /** Target user being impersonated (session.userId). */
  userId: string;
  session: RefreshSessionInsert;
}

/**
 * Atomically create a login session, its refresh token, and bump lastLoginAt.
 * Used on password/OAuth/magic-link login so a partial failure cannot leave an
 * orphan session without a refresh token (or vice versa).
 */
export async function createAuthenticatedSession(input: CreateAuthenticatedSessionInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [session] = await tx.insert(sessionsTable).values(input.session).returning();
    if (!session) throw new Error("SESSION_CREATE_FAILED");

    await tx.insert(refreshTokensTable).values({
      ...input.refreshToken,
      sessionId: session.id,
    });

    await tx
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, input.userId));

    return session;
  });
}

/**
 * Atomically insert an admin impersonation session and bump lastLoginAt for
 * the impersonated (target) user.
 *
 * This keeps session + user write consistent under retries/timeouts and
 * matches the transaction pattern used by `createAuthenticatedSession()`.
 */
export async function createImpersonationSession(input: CreateImpersonationSessionInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const fp = input.session.deviceFingerprint as
      | { impersonatedBy?: string; impersonatorEmail?: string }
      | undefined;
    if (!fp?.impersonatedBy || !fp?.impersonatorEmail) {
      throw new Error("IMPERSONATION_FINGERPRINT_MISSING");
    }

    if (fp.impersonatedBy === input.userId) {
      throw new Error("CANNOT_IMPERSONATE_SELF");
    }

    const [session] = await tx.insert(sessionsTable).values(input.session).returning();
    if (!session) throw new Error("SESSION_CREATE_FAILED");

    await tx
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, input.userId));

    return session;
  });
}

/**
 * Revoke every refresh token and active session in a token family after refresh
 * reuse detection. Both mutations must commit or roll back together.
 */
export async function revokeRefreshTokenFamily(
  familyId: string,
  reason = "refresh_token_reuse"
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const familySessions = await tx
      .select({ sessionId: refreshTokensTable.sessionId })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.familyId, familyId));

    const sessionIds = [...new Set(familySessions.map((row) => row.sessionId))];

    await tx
      .update(refreshTokensTable)
      .set({ isRevoked: true })
      .where(eq(refreshTokensTable.familyId, familyId));

    if (sessionIds.length > 0) {
      await tx
        .update(sessionsTable)
        .set({
          isActive: false,
          revokedAt: new Date(),
          revokedReason: reason,
        })
        .where(inArray(sessionsTable.id, sessionIds));
    }
  });
}

/**
 * Rotate a valid refresh token atomically: mark the old token used, create the
 * replacement session, then persist the replacement refresh token.
 */
export async function rotateRefreshToken(input: RotateRefreshTokenInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(refreshTokensTable)
      .set({ isRevoked: true, usedAt: new Date() })
      .where(eq(refreshTokensTable.id, input.oldRefreshTokenId));

    const [session] = await tx.insert(sessionsTable).values(input.session).returning();
    if (!session) throw new Error("SESSION_CREATE_FAILED");

    await tx.insert(refreshTokensTable).values({
      ...input.refreshToken,
      sessionId: session.id,
    });

    return session;
  });
}

export interface RevokeSessionAtLogoutInput {
  /** Active session from Bearer auth (preferred). */
  sessionId?: string;
  /** Plain refresh token from httpOnly cookie or request body. */
  refreshTokenPlain?: string;
}

/**
 * Revoke the current web session and its refresh token on logout. Both mutations
 * commit or roll back together so a stolen token cannot survive cookie deletion.
 */
export async function revokeSessionAtLogout(input: RevokeSessionAtLogoutInput): Promise<boolean> {
  const db = getDb();
  let revoked = false;

  await db.transaction(async (tx) => {
    let sessionId = input.sessionId;

    if (input.refreshTokenPlain) {
      const tokenHash = hashTokenSha256(input.refreshTokenPlain);
      const rtRows = await tx
        .select({ id: refreshTokensTable.id, sessionId: refreshTokensTable.sessionId })
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.tokenHash, tokenHash))
        .limit(1);
      const rt = rtRows[0];
      if (rt) {
        sessionId = sessionId ?? rt.sessionId ?? undefined;
        await tx
          .update(refreshTokensTable)
          .set({ isRevoked: true })
          .where(eq(refreshTokensTable.id, rt.id));
        revoked = true;
      }
    }

    if (sessionId) {
      await tx
        .update(sessionsTable)
        .set({
          isActive: false,
          revokedAt: new Date(),
          revokedReason: "logout",
        })
        .where(eq(sessionsTable.id, sessionId));
      await tx
        .update(refreshTokensTable)
        .set({ isRevoked: true })
        .where(eq(refreshTokensTable.sessionId, sessionId));
      revoked = true;
    }
  });

  return revoked;
}

export interface SetSessionActiveOrgInput {
  sessionId: string;
  orgId: string | null;
  userId: string;
  user: User;
}

/**
 * Persist (or clear) the active org on a session. Membership is verified unless
 * clearing. Returns whether a row was updated.
 */
export async function setSessionActiveOrg(input: SetSessionActiveOrgInput): Promise<boolean> {
  if (input.orgId !== null) {
    const allowed = await verifyOrgMembership(input.orgId, input.userId, input.user);
    if (!allowed) return false;
  }

  const db = getDb();
  const [updated] = await db
    .update(sessionsTable)
    .set({ activeOrgId: input.orgId, updatedAt: new Date() })
    .where(and(eq(sessionsTable.id, input.sessionId), eq(sessionsTable.userId, input.userId)))
    .returning({ id: sessionsTable.id });

  return Boolean(updated);
}
