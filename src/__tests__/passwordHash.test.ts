import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  dummyPasswordHash,
  hashPassword,
  isLegacyBcryptHash,
  passwordNeedsRehash,
  verifyPassword,
} from "../shared/passwordHash";

const isBunRuntime = typeof Bun !== "undefined" && Boolean(Bun.password);

describe("passwordHash (SEC-8) — bcrypt fallback under vitest/node", () => {
  it("verifies legacy bcrypt hashes without Bun", async () => {
    const bcryptHash = await bcrypt.hash("legacy-pass", 4);
    expect(isLegacyBcryptHash(bcryptHash)).toBe(true);
    expect(await verifyPassword("legacy-pass", bcryptHash)).toBe(true);
    expect(passwordNeedsRehash(bcryptHash)).toBe(true);
  });
});

describe.skipIf(!isBunRuntime)("passwordHash (SEC-8) — argon2id under Bun", () => {
  afterEach(() => {
    // Reset lazy dummy hash between tests that share module state
  });

  it("hashes with argon2id (not bcrypt prefix)", async () => {
    const hash = await hashPassword("test-password-123");
    expect(hash).toBeTruthy();
    expect(isLegacyBcryptHash(hash)).toBe(false);
    expect(await verifyPassword("test-password-123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("verifies legacy bcrypt hashes", async () => {
    const bcryptHash = await bcrypt.hash("legacy-pass", 4);
    expect(isLegacyBcryptHash(bcryptHash)).toBe(true);
    expect(await verifyPassword("legacy-pass", bcryptHash)).toBe(true);
    expect(await verifyPassword("wrong", bcryptHash)).toBe(false);
  });

  it("flags bcrypt hashes for rehash on login", async () => {
    const bcryptHash = await bcrypt.hash("x", 4);
    expect(passwordNeedsRehash(bcryptHash)).toBe(true);
    const argonHash = await hashPassword("x");
    expect(passwordNeedsRehash(argonHash)).toBe(false);
  });

  it("returns a stable dummy hash for timing-safe login", async () => {
    const a = await dummyPasswordHash();
    const b = await dummyPasswordHash();
    expect(a).toBe(b);
    expect(isLegacyBcryptHash(a)).toBe(false);
  });
});
