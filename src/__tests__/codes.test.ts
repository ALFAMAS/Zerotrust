import { describe, expect, it, vi } from "vitest";
import { generateCodeFromAlphabet, generateNumericCode } from "../crypto/codes";

describe("generateNumericCode", () => {
  it("returns a 6-digit code by default", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateNumericCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("honors the requested length and never emits a leading zero", () => {
    for (const digits of [4, 6, 8]) {
      for (let i = 0; i < 200; i++) {
        const code = generateNumericCode(digits);
        expect(code).toHaveLength(digits);
        expect(code[0]).not.toBe("0");
        expect(Number.isInteger(Number(code))).toBe(true);
      }
    }
  });

  it("rejects out-of-range digit counts", () => {
    expect(() => generateNumericCode(1)).toThrow(RangeError);
    expect(() => generateNumericCode(13)).toThrow(RangeError);
    expect(() => generateNumericCode(6.5)).toThrow(RangeError);
  });

  it("does NOT use Math.random (must draw from the crypto CSPRNG)", () => {
    // Regression guard for CWE-330: OTP codes were previously generated with
    // Math.random(), which is predictable. If anyone reintroduces it, this fails.
    const spy = vi.spyOn(Math, "random");
    try {
      generateNumericCode();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("produces a broad spread of values (sanity check on entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateNumericCode());
    // With 900k possible codes, 5000 draws should yield almost all unique.
    expect(seen.size).toBeGreaterThan(4900);
  });
});

describe("generateCodeFromAlphabet", () => {
  it("returns a code of the requested length from the default alphabet", () => {
    const code = generateCodeFromAlphabet(8);
    expect(code).toHaveLength(8);
    // Default alphabet excludes ambiguous 0/O/1/I.
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("supports a custom alphabet", () => {
    const code = generateCodeFromAlphabet(20, "ab");
    expect(code).toMatch(/^[ab]{20}$/);
  });

  it("does NOT use Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    try {
      generateCodeFromAlphabet(8);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects invalid arguments", () => {
    expect(() => generateCodeFromAlphabet(0)).toThrow(RangeError);
    expect(() => generateCodeFromAlphabet(65)).toThrow(RangeError);
    expect(() => generateCodeFromAlphabet(8, "x")).toThrow(RangeError);
  });
});
