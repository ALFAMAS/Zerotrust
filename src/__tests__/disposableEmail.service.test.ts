import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Robustly stub the DNS MX lookup (hoisted so the mock exists before the
// service module is imported).
const { resolveMxMock } = vi.hoisted(() => ({ resolveMxMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ resolveMx: resolveMxMock }));

import {
  isDisposableEmailDomain,
  normalizeEmailDomain,
  validateSignupEmail,
} from "../services/auth/disposableEmail.service";

const ENV_KEYS = [
  "DISPOSABLE_EMAIL_ALLOWLIST",
  "DISPOSABLE_EMAIL_BLOCKLIST",
  "DISPOSABLE_EMAIL_VALIDATE_MX",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resolveMxMock.mockReset();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("normalizeEmailDomain", () => {
  it("extracts and lowercases the domain", () => {
    expect(normalizeEmailDomain("User@Example.COM")).toBe("example.com");
    expect(normalizeEmailDomain("  a@b.io ")).toBe("b.io");
  });

  it("uses the last @ so quoted local parts don't fool it", () => {
    expect(normalizeEmailDomain("a@b@c.com")).toBe("c.com");
  });

  it("returns null for malformed addresses", () => {
    expect(normalizeEmailDomain("no-at-sign")).toBeNull();
    expect(normalizeEmailDomain("@nolocal.com")).toBeNull();
    expect(normalizeEmailDomain("trailing@")).toBeNull();
    expect(normalizeEmailDomain("")).toBeNull();
  });
});

describe("isDisposableEmailDomain", () => {
  it("flags known throwaway domains (case-insensitive)", () => {
    expect(isDisposableEmailDomain("mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("YOPMAIL.com")).toBe(true);
  });

  it("allows normal domains", () => {
    expect(isDisposableEmailDomain("gmail.com")).toBe(false);
  });

  it("honors an env blocklist", () => {
    process.env.DISPOSABLE_EMAIL_BLOCKLIST = "evil.example, spam.test";
    expect(isDisposableEmailDomain("evil.example")).toBe(true);
    expect(isDisposableEmailDomain("spam.test")).toBe(true);
  });

  it("lets the allowlist override the blocklist", () => {
    process.env.DISPOSABLE_EMAIL_ALLOWLIST = "mailinator.com";
    expect(isDisposableEmailDomain("mailinator.com")).toBe(false);
  });
});

describe("validateSignupEmail", () => {
  it("rejects a malformed address", async () => {
    expect(await validateSignupEmail("nope")).toMatchObject({
      allowed: false,
      code: "INVALID_EMAIL",
    });
  });

  it("rejects a disposable address", async () => {
    expect(await validateSignupEmail("a@mailinator.com")).toMatchObject({
      allowed: false,
      code: "DISPOSABLE_EMAIL",
    });
  });

  it("allows a normal address and skips MX when MX checking is off", async () => {
    expect(await validateSignupEmail("a@gmail.com")).toEqual({ allowed: true });
    expect(resolveMxMock).not.toHaveBeenCalled();
  });

  it("allows when MX checking is on and records exist", async () => {
    process.env.DISPOSABLE_EMAIL_VALIDATE_MX = "true";
    resolveMxMock.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
    expect(await validateSignupEmail("a@example.com")).toEqual({ allowed: true });
    expect(resolveMxMock).toHaveBeenCalledWith("example.com");
  });

  it("rejects when MX checking is on and there are no records", async () => {
    process.env.DISPOSABLE_EMAIL_VALIDATE_MX = "true";
    resolveMxMock.mockResolvedValue([]);
    expect(await validateSignupEmail("a@no-mx.example")).toMatchObject({
      allowed: false,
      code: "EMAIL_DOMAIN_HAS_NO_MX",
    });
  });

  it("fails closed when the MX lookup throws", async () => {
    process.env.DISPOSABLE_EMAIL_VALIDATE_MX = "true";
    resolveMxMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await validateSignupEmail("a@broken.example")).toMatchObject({
      allowed: false,
      code: "EMAIL_DOMAIN_HAS_NO_MX",
    });
  });
});
