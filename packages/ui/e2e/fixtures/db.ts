import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { hashTokenSha256 } from "../../../../src/shared/cryptoHash";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = resolve(__dirname, "..", "..", "..", "..", ".env");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("DATABASE_URL=")) {
      return trimmed.slice("DATABASE_URL=".length).trim();
    }
  }

  throw new Error("DATABASE_URL not found for e2e DB helpers");
}

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(getDatabaseUrl());
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function getUserIdByEmail(email: string): Promise<string> {
  return withDb(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`No user found for email ${email}`);
    return id;
  });
}

export async function grantAdminRole(userId: string): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      UPDATE users
      SET roles = CASE
        WHEN 'admin' = ANY(roles) THEN roles
        ELSE array_append(roles, 'admin')
      END
      WHERE id = ${userId}::uuid
    `;
  });
}

export async function verifyUserEmail(userId: string): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      UPDATE users
      SET email_verified_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  });
}

export async function getEmailVerificationCode(userId: string): Promise<string> {
  return withDb(async (sql) => {
    const rows = await sql<{ code: string }[]>`
      SELECT code
      FROM otps
      WHERE user_id = ${userId}
        AND type = 'email_verification'
        AND expires_at > NOW()
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const code = rows[0]?.code;
    if (!code) throw new Error(`No email verification code for user ${userId}`);
    return code;
  });
}

/** Seed a password-reset code the API will accept (hashed like production). */
export async function seedPasswordResetCode(email: string, plainCode: string): Promise<void> {
  const userId = await getUserIdByEmail(email);
  const codeHash = hashTokenSha256(plainCode);
  await withDb(async (sql) => {
    await sql`
      DELETE FROM otps
      WHERE user_id = ${userId} AND type = 'password_reset'
    `;
    await sql`
      INSERT INTO otps (user_id, code, type, channel, target, expires_at)
      VALUES (
        ${userId},
        ${codeHash},
        'password_reset',
        'email',
        ${email},
        NOW() + INTERVAL '15 minutes'
      )
    `;
  });
}

/** Seed a magic-link token the verify page can exchange for a session. */
export async function seedMagicLinkToken(email: string, rawToken: string): Promise<void> {
  const userId = await getUserIdByEmail(email);
  const codeHash = hashTokenSha256(rawToken);
  await withDb(async (sql) => {
    await sql`
      DELETE FROM otps
      WHERE user_id = ${userId} AND type = 'login'
    `;
    await sql`
      INSERT INTO otps (user_id, code, type, channel, target, expires_at)
      VALUES (
        ${userId},
        ${codeHash},
        'login',
        'email',
        ${email.toLowerCase()},
        NOW() + INTERVAL '15 minutes'
      )
    `;
  });
}

export async function unsetEmailVerification(userId: string): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      UPDATE users
      SET email_verified_at = NULL
      WHERE id = ${userId}::uuid
    `;
  });
}

export async function getInviteTokenByEmail(email: string): Promise<string> {
  return withDb(async (sql) => {
    const rows = await sql<{ token: string }[]>`
      SELECT token
      FROM organization_invites
      WHERE lower(email) = lower(${email})
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const token = rows[0]?.token;
    if (!token) throw new Error(`No pending invite for ${email}`);
    return token;
  });
}
