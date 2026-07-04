import { eq } from "drizzle-orm";
import { getDb } from "..";
import { refreshTokensTable, sessionsTable } from "../schema";
import { hashTokenSha256 } from "../../shared/cryptoHash";

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

/**
 * Revoke every refresh token and active session for a user after refresh-token
 * reuse detection. Both mutations must commit or roll back together.
 */
export async function revokeRefreshTokenFamily(
  userId: string,
  reason = "refresh_token_reuse"
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(refreshTokensTable)
      .set({ isRevoked: true })
      .where(eq(refreshTokensTable.userId, userId));

    await tx
      .update(sessionsTable)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason,
      })
      .where(eq(sessionsTable.userId, userId));
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
export async function revokeSessionAtLogout(
  input: RevokeSessionAtLogoutInput
): Promise<boolean> {
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
