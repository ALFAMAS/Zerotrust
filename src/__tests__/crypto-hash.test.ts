import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hashTokenSha256,
  hashTokensSha256,
  hashFingerprint,
  hashBase64Url,
  sha256Hex,
} from "../shared/cryptoHash";

const sampleToken = "scim_abcDEF123_-";

describe("cryptoHash — sha256Hex", () => {
  it("matches node:crypto for the canonical UTF-8 encoding", () => {
    const expected = createHash("sha256").update(sampleToken).digest("hex");
    expect(sha256Hex(sampleToken)).toBe(expected);
  });

  it("emits exactly 64 lowercase hex characters", () => {
    expect(sha256Hex(sampleToken)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("cryptoHash — hashTokenSha256", () => {
  it("is just an alias of sha256Hex", () => {
    expect(hashTokenSha256(sampleToken)).toBe(sha256Hex(sampleToken));
  });

  it("never returns the raw token", () => {
    const out = hashTokenSha256(sampleToken);
    expect(out).not.toContain(sampleToken);
    expect(out).toHaveLength(64);
  });
});

describe("cryptoHash — hashTokensSha256", () => {
  it("maps each input to its hash in order", () => {
    const inputs = ["a", "b", "scim_xyz"];
    const hashes = hashTokensSha256(inputs);
    expect(hashes).toHaveLength(3);
    expect(hashes[0]).toBe(createHash("sha256").update("a").digest("hex"));
    expect(hashes[1]).toBe(createHash("sha256").update("b").digest("hex"));
    expect(hashes[2]).toBe(createHash("sha256").update("scim_xyz").digest("hex"));
  });
});

describe("cryptoHash — hashFingerprint", () => {
  it("returns a 16-char lowercase hex fingerprint", () => {
    const fp = hashFingerprint("Mozilla/5.0 zerotrust");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("stays deterministic for the same input", () => {
    expect(hashFingerprint("Mozilla/5.0")).toBe(hashFingerprint("Mozilla/5.0"));
  });
});

describe("cryptoHash — hashBase64Url", () => {
  it("matches a manual sha256 + base64url for PKCE code_verifier", () => {
    const verifier = "abcdefghijklmnopqrstuvwxyz123456-._~";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(hashBase64Url(verifier)).toBe(expected);
  });
});