import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../db/schema", () => ({ emailSuppressionsTable: { email: "email" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  isEmailSuppressed,
  suppressEmail,
  unsuppressEmail,
} from "../services/emailSuppression.service";
import { getDb } from "../db";

describe("email suppression", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isEmailSuppressed returns true when a row exists (lowercased)", async () => {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve([{ email: "bounce@test.com" }]),
    };
    vi.mocked(getDb).mockReturnValue(chain as any);
    expect(await isEmailSuppressed("Bounce@Test.com")).toBe(true);
  });

  it("isEmailSuppressed returns false when no row", async () => {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve([]),
    };
    vi.mocked(getDb).mockReturnValue(chain as any);
    expect(await isEmailSuppressed("ok@test.com")).toBe(false);
  });

  it("isEmailSuppressed is defensive: returns false on DB error", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("db down");
    });
    expect(await isEmailSuppressed("x@test.com")).toBe(false);
  });

  it("isEmailSuppressed returns false for an empty address", async () => {
    expect(await isEmailSuppressed("")).toBe(false);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("suppressEmail upserts with a lowercased address + reason", async () => {
    const captured: any = {};
    const chain: any = {
      insert: () => chain,
      values: (v: any) => {
        captured.values = v;
        return chain;
      },
      onConflictDoUpdate: (c: any) => {
        captured.conflict = c;
        return Promise.resolve();
      },
    };
    vi.mocked(getDb).mockReturnValue(chain as any);
    await suppressEmail("Bounce@Test.com", "bounce", "550 5.1.1");
    expect(captured.values.email).toBe("bounce@test.com");
    expect(captured.values.reason).toBe("bounce");
    expect(captured.values.detail).toBe("550 5.1.1");
  });

  it("unsuppressEmail reports whether a row was removed", async () => {
    const chain: any = { delete: () => chain, where: () => Promise.resolve({ rowCount: 1 }) };
    vi.mocked(getDb).mockReturnValue(chain as any);
    expect(await unsuppressEmail("x@test.com")).toBe(true);

    const chain0: any = { delete: () => chain0, where: () => Promise.resolve({ rowCount: 0 }) };
    vi.mocked(getDb).mockReturnValue(chain0 as any);
    expect(await unsuppressEmail("y@test.com")).toBe(false);
  });
});
