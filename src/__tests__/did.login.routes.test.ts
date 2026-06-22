import crypto from "crypto";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock("../db", () => ({ getDb: vi.fn() }));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: { tokenSecretHex: "a".repeat(64) },
  }),
}));

vi.mock("../middleware/rateLimiting", () => ({
  rateLimit: () => async (_c: any, next: any) => next(),
}));

// Deterministic token service so session issuance is DB-mockable and offline.
vi.mock("../services/token.service", () => ({
  TokenService: class {
    async init() {}
    async signAccessToken() {
      return "access.jwt.token";
    }
    async verifyAccessToken() {
      return { jti: "jti-1", exp: Math.floor(Date.now() / 1000) + 3600 };
    }
    async signRefreshToken() {
      return "refresh-token-plain";
    }
  },
}));

import { getDb } from "../db";
import didRoutes from "../did/routes";

// ── did:key helpers (mirror did.routes.test.ts) ──────────────────────────────

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) {
    out = BASE58[Number(num % 58n)] + out;
    num /= 58n;
  }
  return "1".repeat(zeros) + out;
}

function makeDidKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  const raw = Buffer.from(jwk.x, "base64url");
  const multibase = "z" + base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), raw]));
  const did = `did:key:${multibase}`;
  return { did, vmId: `${did}#${multibase}`, privateKey };
}

const USER_ID = "00000000-0000-0000-0000-000000000111";
const SESSION_ID = "00000000-0000-0000-0000-000000000222";

function makeApp() {
  return new Hono().route("/", didRoutes);
}

function postJson(a: Hono, path: string, body: unknown) {
  return a.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /login (DID → session)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it("returns 400 when challengeId or proof is missing", async () => {
    const res = await postJson(makeApp(), "/login", { challengeId: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 401 for an unknown challenge", async () => {
    const res = await postJson(makeApp(), "/login", {
      challengeId: "does-not-exist",
      proof: { proofValue: "x" },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("challenge_not_found");
  });

  it("provisions a user and issues a session for a valid proof (full round-trip)", async () => {
    const didEmail = "did-key-..@did.local";
    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        // provisionDIDUser: no existing user for this DID
        .mockResolvedValueOnce([])
        // issueDIDSession: user lookup by id
        .mockResolvedValueOnce([{ id: USER_ID, email: didEmail }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi
        .fn()
        // provisionDIDUser: inserted user
        .mockResolvedValueOnce([{ id: USER_ID, email: didEmail }])
        // issueDIDSession: inserted session
        .mockResolvedValueOnce([{ id: SESSION_ID }]),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const a = makeApp();
    const { did, vmId, privateKey } = makeDidKey();

    const chRes = await postJson(a, "/challenge", { did });
    const { challengeId, challenge, domain } = await chRes.json();

    const created = new Date().toISOString();
    const signedData = JSON.stringify({ did, challenge, domain, timestamp: created });
    const proofValue = crypto.sign(null, Buffer.from(signedData), privateKey).toString("base64url");

    const res = await postJson(a, "/login", {
      challengeId,
      proof: {
        type: "Ed25519Signature2020",
        created,
        verificationMethod: vmId,
        proofPurpose: "authentication",
        challenge,
        domain,
        proofValue,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.did).toBe(did);
    expect(body.accessToken).toBe("access.jwt.token");
    expect(body.refreshToken).toBe("refresh-token-plain");
    expect(body.expiresIn).toBe(3600);

    // A user row and a session row were written.
    expect(db.insert).toHaveBeenCalled();
  });

  it("rejects a tampered signature with 401 (no session issued)", async () => {
    vi.mocked(getDb).mockReturnValue({} as any);
    const a = makeApp();
    const { did, vmId } = makeDidKey();
    const chRes = await postJson(a, "/challenge", { did });
    const { challengeId, challenge, domain } = await chRes.json();

    const res = await postJson(a, "/login", {
      challengeId,
      proof: {
        type: "Ed25519Signature2020",
        created: new Date().toISOString(),
        verificationMethod: vmId,
        proofPurpose: "authentication",
        challenge,
        domain,
        proofValue: Buffer.from("not-a-valid-signature".repeat(4)).toString("base64url"),
      },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).verified).toBe(false);
  });
});
