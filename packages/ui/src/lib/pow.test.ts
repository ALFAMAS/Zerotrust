import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { solveSignupPow } from "./pow";

// Canonical pattern: api.get is a vi.fn so vitest tracks its (resolved/rejected)
// results and we don't leave a free-floating rejection for the unhandled-error
// detector to flag.
vi.mock("./api", () => ({ api: { get: vi.fn() } }));
const getMock = vi.mocked(api.get);

// Re-implement the server's verification to prove the client's solution is real.
async function leadingZeroBits(input: string): Promise<number> {
  const data = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let bits = 0;
  for (const byte of digest) {
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

describe("solveSignupPow", () => {
  beforeEach(() => getMock.mockReset());

  it("returns {} when PoW is disabled server-side", async () => {
    getMock.mockResolvedValue({ enabled: false });
    await expect(solveSignupPow()).resolves.toEqual({});
  });

  it("returns {} when the challenge payload is incomplete", async () => {
    getMock.mockResolvedValue({ enabled: true, challenge: "abc" }); // no difficulty
    await expect(solveSignupPow()).resolves.toEqual({});
  });

  it("produces a solution that actually satisfies the difficulty", async () => {
    const challenge = "test-challenge-xyz";
    const difficulty = 8; // ~256 hashes on average — fast + deterministic enough
    getMock.mockResolvedValue({ enabled: true, challenge, difficulty });

    const { powChallenge, powSolution } = await solveSignupPow();

    expect(powChallenge).toBe(challenge);
    expect(powSolution).toBeDefined();
    // The returned nonce must hash to >= `difficulty` leading zero bits.
    const bits = await leadingZeroBits(`${challenge}:${powSolution}`);
    expect(bits).toBeGreaterThanOrEqual(difficulty);
  });
});
