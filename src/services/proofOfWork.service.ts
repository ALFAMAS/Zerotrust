/**
 * Stateless proof-of-work (hashcash-style) for bot/abuse mitigation on signup.
 *
 * The server issues a signed challenge; the client must find a `solution` such
 * that sha256(`${challenge}:${solution}`) has at least `difficulty` leading zero
 * bits. Verification is stateless — the challenge carries its own HMAC and
 * expiry, so no server-side storage is needed and it scales horizontally.
 *
 * Off by default. Enable with SIGNUP_POW_ENABLED=true; tune SIGNUP_POW_DIFFICULTY
 * (leading zero bits; ~16 ≈ sub-second in a browser) and SIGNUP_POW_TTL_MS.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "../config";

const DEFAULT_DIFFICULTY = parseInt(process.env.SIGNUP_POW_DIFFICULTY || "16", 10);
const TTL_MS = parseInt(process.env.SIGNUP_POW_TTL_MS || String(5 * 60 * 1000), 10);

export function isSignupPowEnabled(): boolean {
  return process.env.SIGNUP_POW_ENABLED === "true";
}

function secret(): string {
  // Reuse the token secret as the HMAC key; it's already a required 32-byte hex.
  return getConfig().security.tokenSecretHex;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface PowChallenge {
  challenge: string;
  difficulty: number;
  expiresAt: number;
}

/** Mint a fresh, self-describing challenge token. */
export function createPowChallenge(difficulty = DEFAULT_DIFFICULTY): PowChallenge {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${nonce}.${expiresAt}.${difficulty}`;
  const challenge = `${payload}.${sign(payload)}`;
  return { challenge, difficulty, expiresAt };
}

/** Count leading zero bits of a byte buffer. */
function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // Count leading zeros within this non-zero byte, then stop.
    let mask = 0x80;
    while (mask > 0 && (byte & mask) === 0) {
      bits += 1;
      mask >>= 1;
    }
    break;
  }
  return bits;
}

export type PowResult = { ok: true } | { ok: false; reason: string };

/** Verify a challenge token + the client's solution. */
export function verifyPowSolution(challenge: string, solution: string): PowResult {
  if (!challenge || typeof solution !== "string") return { ok: false, reason: "MISSING" };

  const parts = challenge.split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };
  const [nonce, expiryStr, difficultyStr, mac] = parts;
  const payload = `${nonce}.${expiryStr}.${difficultyStr}`;

  // 1) Authenticity — constant-time HMAC compare.
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "BAD_SIGNATURE" };

  // 2) Freshness.
  const expiresAt = Number(expiryStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now())
    return { ok: false, reason: "EXPIRED" };

  // 3) Work — solution must yield enough leading zero bits.
  const difficulty = Number(difficultyStr);
  const digest = createHash("sha256").update(`${challenge}:${solution}`).digest();
  if (leadingZeroBits(digest) < difficulty) return { ok: false, reason: "INSUFFICIENT_WORK" };

  return { ok: true };
}
