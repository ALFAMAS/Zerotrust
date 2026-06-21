/**
 * Per-org SCIM 2.0 (RFC 7644) bearer tokens.
 *
 * Each token authenticates SCIM provisioning requests against the org that
 * issued it. The plaintext is returned exactly once at creation/rotation;
 * only the SHA-256 hash is persisted, so a DB read alone cannot impersonate
 * a SCIM client.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { orgScimTokensTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("orgScimToken");

export interface OrgScimToken {
  id: string;
  orgId: string;
  name: string;
  tokenPrefix: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface CreateTokenInput {
  orgId: string;
  name: string;
  createdBy: string;
  /** Optional expiry. Tokens without an expiry never expire automatically. */
  expiresAt?: Date | null;
}

export interface CreateTokenResult {
  /** Public metadata — safe to return in API responses. */
  token: OrgScimToken;
  /** Plaintext token, returned exactly once. Format: `scim_<48 hex chars>`. */
  plaintext: string;
}

const TOKEN_PREFIX = "scim_";
const TOKEN_RANDOM_BYTES = 24; // 48 hex chars

function generatePlaintextToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("hex")}`;
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function deriveDisplayPrefix(plaintext: string): string {
  // Surface the prefix + first few random chars so admins can tell tokens
  // apart at a glance ("scim_a1b2c3d4…" vs "scim_e5f6g7h8…").
  const head = plaintext.slice(0, TOKEN_PREFIX.length + 8);
  return `${head}…`;
}

/**
 * Issue a new per-org SCIM token. Plaintext is returned in the response —
 * the caller must surface it to the admin immediately. Only the hash and
 * display prefix are persisted.
 */
export async function createOrgScimToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const tokenPrefix = deriveDisplayPrefix(plaintext);

  const db = getDb();
  const [row] = await db
    .insert(orgScimTokensTable)
    .values({
      orgId: input.orgId,
      name: input.name,
      tokenPrefix,
      tokenHash,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create SCIM token");
  }

  return {
    token: row as OrgScimToken,
    plaintext,
  };
}

/** List tokens for an org. Plaintext is never returned. */
export async function listOrgScimTokens(orgId: string): Promise<OrgScimToken[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orgScimTokensTable)
    .where(eq(orgScimTokensTable.orgId, orgId))
    .orderBy(desc(orgScimTokensTable.createdAt));
  return rows as OrgScimToken[];
}

/** Single token lookup, scoped to an org for tenant safety. */
export async function getOrgScimToken(
  orgId: string,
  tokenId: string
): Promise<OrgScimToken | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(orgScimTokensTable)
    .where(and(eq(orgScimTokensTable.orgId, orgId), eq(orgScimTokensTable.id, tokenId)))
    .limit(1);
  return (row as OrgScimToken | undefined) ?? null;
}

/**
 * Rotate: invalidate the old token (set `revokedAt`) and issue a fresh one
 * with the same name. Returns the new plaintext — the caller must surface it
 * once and remind the admin that the old token stops working immediately.
 */
export async function rotateOrgScimToken(opts: {
  orgId: string;
  tokenId: string;
  rotatedBy: string;
}): Promise<CreateTokenResult | null> {
  const db = getDb();
  const existing = await getOrgScimToken(opts.orgId, opts.tokenId);
  if (!existing || existing.revokedAt) {
    return null;
  }

  await db
    .update(orgScimTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(orgScimTokensTable.id, opts.tokenId));

  return createOrgScimToken({
    orgId: opts.orgId,
    name: existing.name,
    createdBy: opts.rotatedBy,
    expiresAt: existing.expiresAt,
  });
}

/** Revoke a token. Idempotent — revoking an already-revoked token is a no-op. */
export async function revokeOrgScimToken(orgId: string, tokenId: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(orgScimTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(orgScimTokensTable.orgId, orgId),
        eq(orgScimTokensTable.id, tokenId),
        isNull(orgScimTokensTable.revokedAt)
      )
    )
    .returning({ id: orgScimTokensTable.id });
  return result.length > 0;
}

/**
 * Validate a plaintext bearer token against the per-org token table.
 * Returns the org context on success, or `null` if the token is unknown,
 * revoked, or expired. Updates `lastUsedAt` fire-and-forget on success.
 */
export async function validateOrgScimToken(plaintext: string): Promise<{
  tokenId: string;
  orgId: string;
} | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const tokenHash = hashToken(plaintext);
  const db = getDb();
  const [row] = await db
    .select()
    .from(orgScimTokensTable)
    .where(eq(orgScimTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return null;
  }
  if (row.revokedAt) {
    return null;
  }
  if (row.expiresAt && row.expiresAt < new Date()) {
    return null;
  }

  // Fire-and-forget last-used update.
  db.update(orgScimTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(orgScimTokensTable.id, row.id))
    .catch((err) => {
      logger.warn("Failed to update SCIM token lastUsedAt", err as Error);
    });

  return { tokenId: row.id, orgId: row.orgId };
}

/** Internal helpers exported for tests. Not part of the public API. */
export const _internal = {
  hashToken,
  deriveDisplayPrefix,
  TOKEN_PREFIX,
};
