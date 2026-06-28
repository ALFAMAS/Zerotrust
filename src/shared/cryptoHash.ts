/**
 * Centralized hashing helpers for zerotrust.
 *
 * All token + fingerprint hashing in the codebase goes through this module so
 * we never reintroduce ad-hoc `crypto.createHash("sha256")` callsites that
 * drift from the canonical encoding (UTF-8, hex/base64url) and so the
 * CWE-327 ban on `crypto.createHash("sha1")` for app crypto stays enforceable.
 *
 * HIBP's k-anonymity protocol still legitimately needs SHA-1 (see
 * `src/services/passwordBreach.service.ts`); that one site is intentionally
 * isolated behind `hibpSha1Hex()` and is NOT re-exported here.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex digest of an input string, UTF-8 encoded. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Canonical token-hash function used across services:
 *   - OIDC exchange / refresh codes
 *   - SCIM bearer tokens
 *   - SAML session tokens
 *   - magic-link OTP hashes
 *   - WebAuthn backup codes
 *   - workload credentials
 *
 * Always 64 lowercase hex chars; never returns the raw token.
 */
export function hashTokenSha256(token: string): string {
  return sha256Hex(token);
}

/** Map a list of tokens to their canonical SHA-256 hex digests, preserving order. */
export function hashTokensSha256(tokens: readonly string[]): string[] {
  return tokens.map((t) => sha256Hex(t));
}

/**
 * 16-char lowercase-hex fingerprint of a device / user-agent identifier.
 * Sufficient for sharding by device, not for cryptographic comparison.
 */
export function hashFingerprint(input: string): string {
  return sha256Hex(input).slice(0, 16);
}

/**
 * SHA-256 base64url digest used for PKCE S256 challenges.
 * base64url is the RFC 7636 wire format.
 */
export function hashBase64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}
