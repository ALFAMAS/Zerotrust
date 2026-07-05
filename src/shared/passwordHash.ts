/**
 * Canonical password hashing for zerotrust (SEC-8).
 *
 * New passwords use Bun's native argon2id (OWASP minimum params from
 * docs/security.md §1). Existing bcrypt hashes verify via bcryptjs and are
 * upgraded to argon2id on the next successful login.
 */

import bcrypt from "bcryptjs";

/** OWASP minimum argon2id params — docs/security.md §1 */
export const ARGON2ID_PARAMS = {
  algorithm: "argon2id" as const,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
};

/** True when the stored hash is a legacy bcrypt digest ($2a$ / $2b$ / $2y$). */
export function isLegacyBcryptHash(storedHash: string): boolean {
  return (
    storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")
  );
}

/** Bun.password is only available under the Bun runtime (production + `bun test`). */
function bunPassword(): typeof Bun.password {
  if (typeof Bun === "undefined" || !Bun.password) {
    throw new Error("Bun.password requires the Bun runtime");
  }
  return Bun.password;
}

/** Hash a new password with argon2id. */
export async function hashPassword(password: string): Promise<string> {
  return bunPassword().hash(password, ARGON2ID_PARAMS);
}

let dummyHashPromise: Promise<string> | null = null;

/** Lazy dummy hash — same argon2id cost as real passwords to resist timing enumeration (SEC-2). */
export async function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("invalid-credentials-timing-pad");
  }
  return dummyHashPromise;
}

/** Verify a password against a stored hash (argon2id first, bcrypt fallback). */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isLegacyBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }
  return bunPassword().verify(password, storedHash);
}

/** True when a successful login should rehash to argon2id. */
export function passwordNeedsRehash(storedHash: string): boolean {
  return isLegacyBcryptHash(storedHash);
}
