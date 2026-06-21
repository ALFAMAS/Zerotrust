import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes, createHash } from "crypto";

// ── DB chain helper (matches the org.routes.test.ts pattern) ──────────────

type DbOp = "select" | "from" | "where" | "limit" | "orderBy" | "insert" | "values" | "update" | "set" | "returning" | "delete";

function makeDbChain(returnValue: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    and: vi.fn().mockReturnThis(),
    isNull: vi.fn().mockReturnThis(),
  };
  // `update(...).set(...).where(...).returning(...)` must work as a single chain.
  chain.update.mockImplementation(() => chain);
  chain.set.mockImplementation(() => chain);
  chain.where.mockImplementation(() => chain);
  chain.returning.mockImplementation(() => Promise.resolve(returnValue));
  return chain;
}

let dbChain: any;
vi.mock("../db", () => ({
  getDb: () => dbChain,
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  createOrgScimToken,
  listOrgScimTokens,
  getOrgScimToken,
  rotateOrgScimToken,
  revokeOrgScimToken,
  validateOrgScimToken,
  _internal,
} from "../services/orgScimToken.service";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const TOKEN_ID = "00000000-0000-0000-0000-000000000099";
const USER_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  dbChain = makeDbChain([]);
});

// ── createOrgScimToken ─────────────────────────────────────────────────────

describe("createOrgScimToken", () => {
  it("generates a plaintext token with the scim_ prefix", async () => {
    dbChain.returning.mockResolvedValueOnce([
      {
        id: TOKEN_ID,
        orgId: ORG_ID,
        name: "Okta prod",
        tokenPrefix: "scim_a1b2c3d4…",
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        createdBy: USER_ID,
      },
    ]);

    const result = await createOrgScimToken({
      orgId: ORG_ID,
      name: "Okta prod",
      createdBy: USER_ID,
    });

    expect(result.plaintext).toMatch(/^scim_[a-f0-9]{48}$/);
    expect(result.token.id).toBe(TOKEN_ID);
    expect(result.token.orgId).toBe(ORG_ID);
    expect(result.token.name).toBe("Okta prod");
    expect(result.token.revokedAt).toBeNull();
  });

  it("persists only the hash and a display prefix — never the plaintext", async () => {
    dbChain.returning.mockResolvedValueOnce([{}]);

    const { plaintext } = await createOrgScimToken({
      orgId: ORG_ID,
      name: "Test",
      createdBy: USER_ID,
    });

    const insertedValues = dbChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues.tokenHash).toBe(_internal.hashToken(plaintext));
    expect(insertedValues.tokenPrefix).not.toBe(plaintext);
    expect(insertedValues.tokenPrefix.endsWith("…")).toBe(true);
    expect(JSON.stringify(insertedValues)).not.toContain(plaintext);
  });

  it("throws when the insert returns no row", async () => {
    dbChain.returning.mockResolvedValueOnce([]);
    await expect(
      createOrgScimToken({ orgId: ORG_ID, name: "Test", createdBy: USER_ID })
    ).rejects.toThrow(/Failed to create SCIM token/);
  });

  it("honours an explicit expiresAt", async () => {
    dbChain.returning.mockResolvedValueOnce([{ id: TOKEN_ID, expiresAt: new Date("2030-01-01") }]);
    const expiry = new Date("2030-01-01");
    await createOrgScimToken({
      orgId: ORG_ID,
      name: "Time-boxed",
      createdBy: USER_ID,
      expiresAt: expiry,
    });
    expect(dbChain.values.mock.calls[0]?.[0]).toMatchObject({ expiresAt: expiry });
  });
});

// ── listOrgScimTokens ──────────────────────────────────────────────────────

describe("listOrgScimTokens", () => {
  it("returns tokens scoped to the org", async () => {
    const rows = [
      { id: "t1", orgId: ORG_ID, name: "A" },
      { id: "t2", orgId: ORG_ID, name: "B" },
    ];
    dbChain.orderBy.mockReturnValueOnce({ ...dbChain, then: undefined });
    // Simpler: override orderBy to resolve.
    dbChain.orderBy = vi.fn().mockResolvedValueOnce(rows);
    const result = await listOrgScimTokens(ORG_ID);
    expect(result).toEqual(rows);
  });

  it("returns an empty array when the org has no tokens", async () => {
    dbChain.orderBy = vi.fn().mockResolvedValueOnce([]);
    const result = await listOrgScimTokens(ORG_ID);
    expect(result).toEqual([]);
  });
});

// ── getOrgScimToken ────────────────────────────────────────────────────────

describe("getOrgScimToken", () => {
  it("returns the matching token scoped to the org", async () => {
    const row = { id: TOKEN_ID, orgId: ORG_ID, name: "A" };
    dbChain.limit.mockResolvedValueOnce([row]);
    const result = await getOrgScimToken(ORG_ID, TOKEN_ID);
    expect(result).toEqual(row);
  });

  it("returns null when the token does not exist", async () => {
    dbChain.limit.mockResolvedValueOnce([]);
    const result = await getOrgScimToken(ORG_ID, TOKEN_ID);
    expect(result).toBeNull();
  });
});

// ── rotateOrgScimToken ─────────────────────────────────────────────────────

describe("rotateOrgScimToken", () => {
  it("revokes the old token and issues a new one with the same name", async () => {
    // First call: getOrgScimToken → existing
    dbChain.limit.mockResolvedValueOnce([
      {
        id: TOKEN_ID,
        orgId: ORG_ID,
        name: "Okta",
        tokenPrefix: "scim_old…",
        expiresAt: null,
        revokedAt: null,
      },
    ]);
    // revoke update + new insert both share the same chain; mock the final returning for the new insert.
    dbChain.returning.mockResolvedValueOnce([
      {
        id: "new-token-id",
        orgId: ORG_ID,
        name: "Okta",
        tokenPrefix: "scim_new…",
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
        createdBy: USER_ID,
      },
    ]);

    const result = await rotateOrgScimToken({
      orgId: ORG_ID,
      tokenId: TOKEN_ID,
      rotatedBy: USER_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.plaintext).toMatch(/^scim_[a-f0-9]{48}$/);
    expect(result?.token.id).toBe("new-token-id");
    expect(result?.token.name).toBe("Okta");

    // The first write should have set revokedAt on the old token.
    const revokeCall = dbChain.set.mock.calls.find(
      (c: any[]) => c[0] && typeof c[0] === "object" && "revokedAt" in c[0]
    );
    expect(revokeCall).toBeDefined();
  });

  it("returns null when the token does not exist", async () => {
    dbChain.limit.mockResolvedValueOnce([]);
    const result = await rotateOrgScimToken({
      orgId: ORG_ID,
      tokenId: TOKEN_ID,
      rotatedBy: USER_ID,
    });
    expect(result).toBeNull();
  });

  it("returns null when the token is already revoked", async () => {
    dbChain.limit.mockResolvedValueOnce([
      { id: TOKEN_ID, orgId: ORG_ID, name: "X", revokedAt: new Date() },
    ]);
    const result = await rotateOrgScimToken({
      orgId: ORG_ID,
      tokenId: TOKEN_ID,
      rotatedBy: USER_ID,
    });
    expect(result).toBeNull();
  });
});

// ── revokeOrgScimToken ─────────────────────────────────────────────────────

describe("revokeOrgScimToken", () => {
  it("returns true when a row was updated", async () => {
    dbChain.returning.mockResolvedValueOnce([{ id: TOKEN_ID }]);
    const result = await revokeOrgScimToken(ORG_ID, TOKEN_ID);
    expect(result).toBe(true);
  });

  it("returns false when the token was already revoked (no rows updated)", async () => {
    dbChain.returning.mockResolvedValueOnce([]);
    const result = await revokeOrgScimToken(ORG_ID, TOKEN_ID);
    expect(result).toBe(false);
  });
});

// ── validateOrgScimToken ───────────────────────────────────────────────────

describe("validateOrgScimToken", () => {
  it("returns null when the token does not start with the prefix", async () => {
    const result = await validateOrgScimToken("not-a-scim-token");
    expect(result).toBeNull();
  });

  it("returns null when the token is unknown", async () => {
    dbChain.limit.mockResolvedValueOnce([]);
    const result = await validateOrgScimToken("scim_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(result).toBeNull();
  });

  it("returns null when the token is revoked", async () => {
    dbChain.limit.mockResolvedValueOnce([{ id: TOKEN_ID, orgId: ORG_ID, revokedAt: new Date() }]);
    const result = await validateOrgScimToken("scim_abc");
    expect(result).toBeNull();
  });

  it("returns null when the token is expired", async () => {
    dbChain.limit.mockResolvedValueOnce([
      { id: TOKEN_ID, orgId: ORG_ID, revokedAt: null, expiresAt: new Date("2000-01-01") },
    ]);
    const result = await validateOrgScimToken("scim_abc");
    expect(result).toBeNull();
  });

  it("returns the org context on success and fires a lastUsedAt update", async () => {
    dbChain.limit.mockResolvedValueOnce([
      { id: TOKEN_ID, orgId: ORG_ID, revokedAt: null, expiresAt: null },
    ]);
    const result = await validateOrgScimToken("scim_abc");
    expect(result).toEqual({ tokenId: TOKEN_ID, orgId: ORG_ID });
    // The fire-and-forget update should have been kicked off.
    expect(dbChain.update).toHaveBeenCalled();
  });
});

// ── _internal helpers ──────────────────────────────────────────────────────

describe("internal helpers", () => {
  it("hashToken produces a deterministic SHA-256 hex digest", () => {
    const input = "scim_abc123";
    const expected = createHash("sha256").update(input).digest("hex");
    expect(_internal.hashToken(input)).toBe(expected);
    expect(_internal.hashToken(input)).toHaveLength(64);
  });

  it("deriveDisplayPrefix keeps the prefix plus 8 chars, then ellipsis", () => {
    const prefix = _internal.deriveDisplayPrefix("scim_a1b2c3d4e5f6g7h8rest_of_token");
    expect(prefix).toBe("scim_a1b2c3d4…");
    expect(prefix.endsWith("…")).toBe(true);
  });

  it("TOKEN_PREFIX is the documented prefix", () => {
    expect(_internal.TOKEN_PREFIX).toBe("scim_");
  });
});

// ── Sanity: the randomBytes import is used ──────────────────────────────────
void randomBytes;