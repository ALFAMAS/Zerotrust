import { eq } from "drizzle-orm";
import { getDb } from "..";
import { refreshTokensTable, sessionsTable, usersTable } from "../schema";
import type { Passkey, User } from "../../shared/types";

const DEFAULT_MFA: User["mfa"] = {
  totp: { enabled: false, backupCodes: [] },
  webauthn: { enabled: false },
};

export type PasskeySessionInsert = typeof sessionsTable.$inferInsert;
export type PasskeyRefreshTokenInsert = Omit<
  typeof refreshTokensTable.$inferInsert,
  "sessionId"
>;

/**
 * Append a verified passkey credential and enable WebAuthn MFA atomically.
 */
export async function registerPasskey(userId: string, newPasskey: Passkey): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ passkeys: usersTable.passkeys, mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!row) throw new Error("USER_NOT_FOUND");

    const existingPasskeys = (row.passkeys as Passkey[] | null) || [];
    const currentMfa = (row.mfa as User["mfa"] | null) ?? DEFAULT_MFA;

    await tx
      .update(usersTable)
      .set({
        passkeys: [...existingPasskeys, newPasskey],
        mfa: { ...currentMfa, webauthn: { enabled: true } },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  });
}

export interface CompletePasskeyAuthenticationInput {
  userId: string;
  updatedPasskeys: Passkey[];
  session: PasskeySessionInsert;
  refreshToken: PasskeyRefreshTokenInsert;
}

/**
 * Persist passkey counter rotation, session, and refresh token together after
 * a successful WebAuthn authentication.
 */
export async function completePasskeyAuthentication(input: CompletePasskeyAuthenticationInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passkeys: input.updatedPasskeys, updatedAt: new Date() })
      .where(eq(usersTable.id, input.userId));

    const [session] = await tx.insert(sessionsTable).values(input.session).returning();
    if (!session) throw new Error("SESSION_CREATE_FAILED");

    await tx.insert(refreshTokensTable).values({
      ...input.refreshToken,
      sessionId: session.id,
    });

    return session;
  });
}
