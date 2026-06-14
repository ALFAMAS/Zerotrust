import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import crypto from "crypto";
import didRoutes from "../did/routes";

// Base58btc encoder matching the decoder in src/did/resolver.ts.
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

// Build a real did:key (Ed25519) plus its signing key.
function makeDidKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  const raw = Buffer.from(jwk.x, "base64url"); // 32-byte raw public key
  const multibase = "z" + base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), raw]));
  const did = `did:key:${multibase}`;
  return { did, vmId: `${did}#${multibase}`, privateKey };
}

function app() {
  return new Hono().route("/", didRoutes);
}

function postJson(a: Hono, path: string, body: unknown) {
  return a.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DID routes", () => {
  describe("GET /resolve", () => {
    it("resolves a did:key to its DID document", async () => {
      const { did } = makeDidKey();
      const res = await app().request(`/resolve?did=${encodeURIComponent(did)}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.didDocument.id).toBe(did);
      expect(body.didDocument.authentication.length).toBeGreaterThan(0);
    });

    it("returns 400 when did is missing", async () => {
      const res = await app().request("/resolve");
      expect(res.status).toBe(400);
    });

    it("returns 400 for an unsupported DID method", async () => {
      const res = await app().request("/resolve?did=did:example:123");
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("did_resolution_failed");
    });
  });

  describe("POST /challenge", () => {
    it("returns 400 when did is missing", async () => {
      const res = await postJson(app(), "/challenge", {});
      expect(res.status).toBe(400);
    });

    it("issues a challenge for a resolvable DID", async () => {
      const { did } = makeDidKey();
      const res = await postJson(app(), "/challenge", { did });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.challengeId).toBeTruthy();
      expect(body.challenge).toBeTruthy();
      expect(body.domain).toBeTruthy();
    });
  });

  describe("POST /verify", () => {
    it("returns 400 when challengeId or proof is missing", async () => {
      const res = await postJson(app(), "/verify", { challengeId: "x" });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown challenge", async () => {
      const res = await postJson(app(), "/verify", {
        challengeId: "does-not-exist",
        proof: { proofValue: "x" },
      });
      expect(res.status).toBe(401);
      expect((await res.json()).reason).toBe("challenge_not_found");
    });

    it("verifies a correctly signed proof (full round-trip)", async () => {
      const a = app();
      const { did, vmId, privateKey } = makeDidKey();

      const chRes = await postJson(a, "/challenge", { did });
      const { challengeId, challenge, domain } = await chRes.json();

      const created = new Date().toISOString();
      const signedData = JSON.stringify({ did, challenge, domain, timestamp: created });
      const proofValue = crypto.sign(null, Buffer.from(signedData), privateKey).toString("base64url");

      const res = await postJson(a, "/verify", {
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
      expect(body.method).toBe("key");
    });

    it("rejects a tampered signature", async () => {
      const a = app();
      const { did, vmId } = makeDidKey();
      const chRes = await postJson(a, "/challenge", { did });
      const { challengeId, challenge, domain } = await chRes.json();

      const res = await postJson(a, "/verify", {
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
});
