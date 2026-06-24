/**
 * Secure code generation.
 *
 * Centralizes generation of one-time codes (email/SMS OTP, verification,
 * re-verification) and short public identifiers (referral codes) so every
 * call site uses a cryptographically secure RNG (`crypto.randomInt`) rather
 * than `Math.random()`.
 *
 * `Math.random()` is NOT cryptographically secure: its output is predictable
 * from a handful of observed values, which lets an attacker guess future OTPs.
 * `crypto.randomInt` draws from the OS CSPRNG and is free of modulo bias.
 *
 * Reference: OWASP ASVS V6 (cryptographic verification) / CWE-330 (use of
 * insufficiently random values).
 */

import { randomInt } from "node:crypto";

// Unambiguous alphabet for human-readable public codes — no 0/O/1/I to avoid
// transcription errors.
const READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a fixed-length numeric one-time code (default 6 digits).
 *
 * The returned string is always exactly `digits` characters long and never has
 * a leading zero, preserving the observable shape of the codes this codebase
 * already issues (`crypto.randomInt(100000, 999999)`), while routing every
 * call through a single audited implementation.
 *
 * @param digits number of digits (2–12). Defaults to 6.
 */
export function generateNumericCode(digits = 6): string {
  if (!Number.isInteger(digits) || digits < 2 || digits > 12) {
    throw new RangeError("generateNumericCode: digits must be an integer in [2, 12]");
  }
  const min = 10 ** (digits - 1);
  const max = 10 ** digits; // exclusive upper bound for randomInt
  return String(randomInt(min, max));
}

/**
 * Generate a cryptographically secure code from an explicit alphabet, free of
 * modulo bias (each character drawn with `crypto.randomInt`).
 *
 * @param length    number of characters (1–64).
 * @param alphabet  characters to draw from (defaults to an unambiguous A–Z/2–9 set).
 */
export function generateCodeFromAlphabet(length: number, alphabet = READABLE_ALPHABET): string {
  if (!Number.isInteger(length) || length < 1 || length > 64) {
    throw new RangeError("generateCodeFromAlphabet: length must be an integer in [1, 64]");
  }
  if (alphabet.length < 2) {
    throw new RangeError("generateCodeFromAlphabet: alphabet must have at least 2 characters");
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(0, alphabet.length)];
  }
  return out;
}
