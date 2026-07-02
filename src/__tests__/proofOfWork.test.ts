import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";

vi.mock("../config", () => ({
  getConfig: () => ({ security: { tokenSecretHex: "a".repeat(64) } }),
}));

import { createPowChallenge, verifyPowSolution } from "../services/auth/proofOfWork.service";

/** Brute-force a solution with the same rule the server verifies. */
function solve(challenge: string, difficulty: number): string {
  function leadingZeroBits(buf: Buffer): number {
    let bits = 0;
    for (const byte of buf) {
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
  for (let i = 0; i < 5_000_000; i++) {
    const digest = createHash("sha256").update(`${challenge}:${i}`).digest();
    if (leadingZeroBits(digest) >= difficulty) return String(i);
  }
  throw new Error("no solution found");
}

describe("proof-of-work", () => {
  it("accepts a correct solution", () => {
    const { challenge, difficulty } = createPowChallenge(10);
    const solution = solve(challenge, difficulty);
    expect(verifyPowSolution(challenge, solution)).toEqual({ ok: true });
  });

  it("rejects an incorrect solution (insufficient work)", () => {
    const { challenge } = createPowChallenge(20);
    const res = verifyPowSolution(challenge, "0");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("INSUFFICIENT_WORK");
  });

  it("rejects a tampered challenge", () => {
    const { challenge, difficulty } = createPowChallenge(8);
    const solution = solve(challenge, difficulty);
    // Flip the difficulty field — HMAC no longer matches.
    const parts = challenge.split(".");
    parts[2] = "1";
    const tampered = parts.join(".");
    const res = verifyPowSolution(tampered, solution);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects an expired challenge", () => {
    const real = Date.now;
    const { challenge, difficulty } = createPowChallenge(8);
    const solution = solve(challenge, difficulty);
    // Jump past the TTL.
    Date.now = () => real() + 10 * 60 * 1000;
    try {
      const res = verifyPowSolution(challenge, solution);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("EXPIRED");
    } finally {
      Date.now = real;
    }
  });

  it("rejects malformed input", () => {
    expect(verifyPowSolution("", "1").ok).toBe(false);
    expect(verifyPowSolution("a.b.c", "1").ok).toBe(false);
  });
});
