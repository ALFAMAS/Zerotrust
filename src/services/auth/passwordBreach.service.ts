/**
 * HaveIBeenPwned password breach check (k-anonymity model).
 * Only the first 5 chars of the SHA-1 hash are sent to the API —
 * the plaintext password never leaves the server.
 * https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getLogger } from "../../logger/index";
import { fetchFixedUrl } from "../../shared/safeFetch";

const logger = getLogger("password-breach");

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const encoder = new TextEncoder();

export interface BreachCheckResult {
  breached: boolean;
  /** Number of times this password appears in known breaches (0 if clean). */
  count: number;
  /** True when the check could not be completed (network error) — fail open. */
  skipped: boolean;
}

export function isBreachCheckEnabled(): boolean {
  return process.env.HIBP_CHECK_ENABLED !== "false";
}

/**
 * HIBP's k-anonymity password API is specified in SHA-1 space, so this legacy
 * hash is protocol compatibility only — never use it for app cryptography,
 * token storage, password storage, signatures, or new security decisions.
 */
function hibpSha1Hex(password: string): string {
  return bytesToHex(sha1(encoder.encode(password))).toUpperCase();
}

/**
 * Returns breach info for a password. Fails open: network problems never
 * block registration or password changes.
 */
export async function checkPasswordBreached(password: string): Promise<BreachCheckResult> {
  if (!isBreachCheckEnabled()) return { breached: false, count: 0, skipped: true };

  try {
    const hibpHash = hibpSha1Hex(password);
    const prefix = hibpHash.slice(0, 5);
    const suffix = hibpHash.slice(5);

    const res = await fetchFixedUrl(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) {
      logger.warn("HIBP range query failed", { status: res.status });
      return { breached: false, count: 0, skipped: true };
    }

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10) || 0;
        if (count > 0) return { breached: true, count, skipped: false };
      }
    }
    return { breached: false, count: 0, skipped: false };
  } catch (err) {
    logger.warn("HIBP check skipped (network error)", { error: String(err) });
    return { breached: false, count: 0, skipped: true };
  }
}

/**
 * Convenience guard for route handlers. Returns an error message when the
 * password is breached and policy says to block, otherwise null.
 */
export async function rejectIfBreached(password: string): Promise<string | null> {
  const result = await checkPasswordBreached(password);
  if (result.breached) {
    return `This password has appeared in ${result.count.toLocaleString()} known data breaches. Please choose a different password.`;
  }
  return null;
}
