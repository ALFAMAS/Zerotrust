import { eq } from "drizzle-orm";
import { getDb } from "..";
import { refreshTokensTable, sessionsTable } from "../schema";

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
