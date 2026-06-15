/**
 * Compliance test for the v4.local primitive against the OFFICIAL
 * paseto-standard test vectors (https://github.com/paseto-standard/test-vectors).
 *
 * 4-E-*  : valid local encrypt/decrypt vectors — byte-exact token + payload.
 * 4-F-2  : a v4.public token, must be rejected by v4.local decrypt.
 * 4-F-3  : a v3.local token, must be rejected (wrong version).
 *
 * If these pass, the implementation is byte-for-byte spec compliant.
 */
import { describe, it, expect } from "vitest";
import { encrypt, decrypt, PasetoError } from "../crypto/paseto-v4";
import vectors from "./fixtures/paseto-v4-vectors.json";

const enc = new TextEncoder();
const dec = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}

describe("PASETO v4.local — official test vectors", () => {
  for (const t of vectors.tests) {
    const expectFail = t["expect-fail"];

    if (!expectFail) {
      it(`${t.name}: encrypt reproduces the exact token`, () => {
        const token = encrypt(
          hexToBytes(t.key),
          enc.encode(t.payload),
          enc.encode(t.footer),
          enc.encode(t["implicit-assertion"]),
          hexToBytes(t.nonce)
        );
        expect(token).toBe(t.token);
      });

      it(`${t.name}: decrypt recovers the exact payload`, () => {
        const out = decrypt(
          hexToBytes(t.key),
          t.token,
          enc.encode(t.footer),
          enc.encode(t["implicit-assertion"])
        );
        expect(dec.decode(out)).toBe(t.payload);
      });
    } else {
      it(`${t.name}: decrypt rejects the invalid token`, () => {
        expect(() =>
          decrypt(
            hexToBytes(t.key),
            t.token,
            enc.encode(t.footer),
            enc.encode(t["implicit-assertion"])
          )
        ).toThrow(PasetoError);
      });
    }
  }
});

describe("PASETO v4.local — properties", () => {
  const key = hexToBytes("707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f");
  const msg = enc.encode('{"data":"hello"}');

  it("uses a fresh random nonce per call (no nonce reuse)", () => {
    const a = encrypt(key, msg);
    const b = encrypt(key, msg);
    expect(a).not.toBe(b); // different nonce ⇒ different token
    expect(dec.decode(decrypt(key, a))).toBe('{"data":"hello"}');
    expect(dec.decode(decrypt(key, b))).toBe('{"data":"hello"}');
  });

  it("rejects a flipped ciphertext bit (auth tag fails)", () => {
    const token = encrypt(key, msg);
    const parts = token.split(".");
    const body = Buffer.from(parts[2], "base64url");
    body[40] ^= 0x01; // flip a bit inside the ciphertext region
    const tampered = `v4.local.${body.toString("base64url")}`;
    expect(() => decrypt(key, tampered)).toThrow(PasetoError);
  });

  it("rejects when the implicit assertion differs", () => {
    const token = encrypt(key, msg, new Uint8Array(0), enc.encode("bound-context"));
    expect(() => decrypt(key, token, new Uint8Array(0), enc.encode("other-context"))).toThrow(
      PasetoError
    );
    expect(dec.decode(decrypt(key, token, new Uint8Array(0), enc.encode("bound-context")))).toBe(
      '{"data":"hello"}'
    );
  });

  it("rejects a footer that does not match the expected footer", () => {
    const token = encrypt(key, msg, enc.encode("kid-1"));
    expect(() => decrypt(key, token, enc.encode("kid-2"))).toThrow("FOOTER_MISMATCH");
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encrypt(new Uint8Array(16), msg)).toThrow("INVALID_KEY_LENGTH");
  });
});
