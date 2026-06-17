import { api } from "./api";

/**
 * Client side of the signup proof-of-work. Fetches a challenge; if PoW is
 * disabled server-side, returns nothing and registration proceeds normally.
 * Otherwise brute-forces a solution (sha256(`${challenge}:${n}`) with the
 * required leading zero bits) using SubtleCrypto and returns it.
 */

interface ChallengeResponse {
  enabled: boolean;
  challenge?: string;
  difficulty?: number;
}

function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    let mask = 0x80;
    while (mask > 0 && (byte & mask) === 0) {
      bits += 1;
      mask >>= 1;
    }
    break;
  }
  return bits;
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/**
 * Returns `{ powChallenge, powSolution }` to merge into the register payload, or
 * `{}` when PoW is disabled. Throws only on an unexpected challenge fetch error.
 */
export async function solveSignupPow(): Promise<{ powChallenge?: string; powSolution?: string }> {
  let res: ChallengeResponse;
  try {
    res = await api.get<ChallengeResponse>("/auth/pow/challenge");
  } catch {
    // If the challenge can't be fetched, don't block signup on the client.
    return {};
  }
  if (!res?.enabled || !res.challenge || !res.difficulty) return {};

  const { challenge, difficulty } = res;
  // Bounded loop; difficulty ~16 bits resolves in well under a second.
  for (let n = 0; n < 50_000_000; n++) {
    const bytes = await sha256Bytes(`${challenge}:${n}`);
    if (leadingZeroBits(bytes) >= difficulty) {
      return { powChallenge: challenge, powSolution: String(n) };
    }
  }
  throw new Error("Could not complete the anti-bot challenge. Please try again.");
}
