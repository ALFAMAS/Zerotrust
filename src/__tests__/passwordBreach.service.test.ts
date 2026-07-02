import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { checkPasswordBreached, rejectIfBreached } from "../services/auth/passwordBreach.service";

function hibpResponseFor(password: string, count: number): string {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const suffix = sha1.slice(5);
  // Mixed response: an unrelated line plus the matching suffix
  return `0018A45C4D1DEF81644B54AB7F969B88D65:1\n${suffix}:${count}\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2`;
}

describe("passwordBreach.service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.HIBP_CHECK_ENABLED;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("flags a breached password with its count", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => hibpResponseFor("password123", 12345),
    }) as any;

    const result = await checkPasswordBreached("password123");
    expect(result.breached).toBe(true);
    expect(result.count).toBe(12345);
    expect(result.skipped).toBe(false);
  });

  it("passes a clean password", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1",
    }) as any;

    const result = await checkPasswordBreached("super-unique-passphrase-42");
    expect(result.breached).toBe(false);
    expect(result.count).toBe(0);
  });

  it("only sends the 5-char SHA-1 prefix to the API (k-anonymity)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    globalThis.fetch = fetchMock as any;

    await checkPasswordBreached("hunter2");
    const url = fetchMock.mock.calls[0][0] as string;
    const sha1 = crypto.createHash("sha1").update("hunter2").digest("hex").toUpperCase();
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(url).not.toContain(sha1.slice(5));
  });

  it("fails open on network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as any;

    const result = await checkPasswordBreached("anything");
    expect(result.breached).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("fails open on non-200 responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

    const result = await checkPasswordBreached("anything");
    expect(result.breached).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("is disabled via HIBP_CHECK_ENABLED=false", async () => {
    process.env.HIBP_CHECK_ENABLED = "false";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const result = await checkPasswordBreached("password123");
    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejectIfBreached returns a human message for breached passwords", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => hibpResponseFor("qwerty", 999),
    }) as any;

    const message = await rejectIfBreached("qwerty");
    expect(message).toContain("999");
    expect(message).toContain("data breaches");
  });

  it("rejectIfBreached returns null for clean passwords", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" }) as any;
    expect(await rejectIfBreached("a-very-clean-password")).toBeNull();
  });
});
