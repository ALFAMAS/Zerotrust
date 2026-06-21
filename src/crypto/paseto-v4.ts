/**
 * PASETO v4.local — spec-compliant implementation.
 *
 * Faithful to the PASETO specification (paseto.io, draft-paragon-paseto-rfc):
 *   v4.local = XChaCha20 (raw stream) for confidentiality
 *            + keyed BLAKE2b for authentication
 *            + PAE (Pre-Authentication Encoding) binding header/nonce/footer/implicit.
 *
 * Bun/WebCrypto exposes neither XChaCha20 nor BLAKE2b, so the two missing
 * primitives come from the audited @noble packages; everything else (key
 * splitting, PAE, encoding, constant-time tag check) is implemented here per
 * spec and validated against the official paseto-standard test vectors in
 * src/__tests__/paseto-v4.test.ts.
 *
 * Reference: https://github.com/paseto-standard/paseto-spec/blob/master/docs/01-Protocol-Versions/Version4.md
 */

import { timingSafeEqual } from "node:crypto";
import { xchacha20 } from "@noble/ciphers/chacha.js";
import { blake2b } from "@noble/hashes/blake2.js";

const HEADER = "v4.local.";
const HEADER_BYTES = utf8("v4.local.");
const NONCE_LEN = 32; // PASETO nonce
const TAG_LEN = 32; // BLAKE2b auth tag
const ENC_KEY_INFO = utf8("paseto-encryption-key");
const AUTH_KEY_INFO = utf8("paseto-auth-key-for-aead");

export class PasetoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasetoError";
  }
}

/**
 * Encrypt a v4.local token.
 *
 * @param key     32-byte symmetric key.
 * @param message payload bytes (typically a JSON-encoded claims set).
 * @param footer  optional, authenticated-but-not-encrypted bytes.
 * @param implicit optional implicit assertion — authenticated, never transmitted.
 * @param nonce   optional 32-byte nonce; ONLY pass this to reproduce a known
 *                test vector. In production leave it undefined so a fresh
 *                random nonce is generated for every call.
 */
export function encrypt(
  key: Uint8Array,
  message: Uint8Array,
  footer: Uint8Array = new Uint8Array(0),
  implicit: Uint8Array = new Uint8Array(0),
  nonce?: Uint8Array
): string {
  assertKey(key);
  const n = nonce ?? crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  if (n.length !== NONCE_LEN) throw new PasetoError("INVALID_NONCE_LENGTH");

  const { encKey, nonce2, authKey } = splitKeys(key, n);

  // Raw XChaCha20 stream cipher (no Poly1305 — BLAKE2b provides the MAC).
  const ciphertext = xchacha20(encKey, nonce2, message);

  // pre-auth = PAE([header, n, ciphertext, footer, implicit])
  const preAuth = pae([HEADER_BYTES, n, ciphertext, footer, implicit]);
  const tag = blake2b(preAuth, { key: authKey, dkLen: TAG_LEN });

  const body = concat(n, ciphertext, tag);
  let token = HEADER + base64UrlEncode(body);
  if (footer.length > 0) token += `.${base64UrlEncode(footer)}`;
  return token;
}

/**
 * Decrypt and authenticate a v4.local token. Throws {@link PasetoError} on any
 * malformed input, wrong header/version, footer mismatch, or failed auth tag.
 *
 * @param expectedFooter if provided, must match the token's footer exactly
 *                       (constant-time compared).
 */
export function decrypt(
  key: Uint8Array,
  token: string,
  expectedFooter?: Uint8Array,
  implicit: Uint8Array = new Uint8Array(0)
): Uint8Array {
  assertKey(key);
  if (typeof token !== "string" || !token.startsWith(HEADER)) {
    throw new PasetoError("INVALID_HEADER");
  }

  const parts = token.split(".");
  // "v4" "." "local" "." body [ "." footer ]
  if (parts.length !== 3 && parts.length !== 4) {
    throw new PasetoError("INVALID_TOKEN");
  }

  const footer = parts.length === 4 ? base64UrlDecode(parts[3]) : new Uint8Array(0);
  if (expectedFooter !== undefined && !constantTimeEqual(footer, expectedFooter)) {
    throw new PasetoError("FOOTER_MISMATCH");
  }

  const body = base64UrlDecode(parts[2]);
  if (body.length < NONCE_LEN + TAG_LEN) throw new PasetoError("INVALID_TOKEN");

  const n = body.subarray(0, NONCE_LEN);
  const ciphertext = body.subarray(NONCE_LEN, body.length - TAG_LEN);
  const tag = body.subarray(body.length - TAG_LEN);

  const { encKey, nonce2, authKey } = splitKeys(key, n);

  // Recompute and verify the auth tag BEFORE decrypting (encrypt-then-MAC).
  const preAuth = pae([HEADER_BYTES, n, ciphertext, footer, implicit]);
  const expectedTag = blake2b(preAuth, { key: authKey, dkLen: TAG_LEN });
  if (!constantTimeEqual(tag, expectedTag)) {
    throw new PasetoError("INVALID_AUTH_TAG");
  }

  return xchacha20(encKey, nonce2, ciphertext);
}

/**
 * Derive the per-message encryption key + XChaCha nonce and auth key from the
 * master key and the random nonce, exactly as the v4.local spec prescribes.
 */
function splitKeys(key: Uint8Array, n: Uint8Array) {
  // tmp = BLAKE2b-56( "paseto-encryption-key" || n, keyed with `key` )
  const tmp = blake2b(concat(ENC_KEY_INFO, n), { key, dkLen: 56 });
  const encKey = tmp.subarray(0, 32);
  const nonce2 = tmp.subarray(32, 56); // 24-byte XChaCha20 nonce
  const authKey = blake2b(concat(AUTH_KEY_INFO, n), { key, dkLen: TAG_LEN });
  return { encKey, nonce2, authKey };
}

/**
 * PAE — Pre-Authentication Encoding.
 * PAE(pieces) = LE64(count) || for each p: LE64(len(p)) || p
 */
export function pae(pieces: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [le64(pieces.length)];
  for (const p of pieces) {
    parts.push(le64(p.length));
    parts.push(p);
  }
  return concat(...parts);
}

/**
 * 64-bit unsigned little-endian length, with the high bit of the most
 * significant byte cleared (per spec, to forbid lengths ≥ 2^63). JS numbers are
 * safe to 2^53, which covers every realistic token component.
 */
function le64(n: number): Uint8Array {
  const out = new Uint8Array(8);
  let value = n;
  for (let i = 0; i < 8; i++) {
    if (i === 7) value &= 0x7f; // clear the top bit
    out[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return out;
}

function assertKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new PasetoError("INVALID_KEY_LENGTH");
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}
