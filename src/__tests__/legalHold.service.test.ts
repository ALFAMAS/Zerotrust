import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../db/schema", () => ({ usersTable: { id: "id", legalHold: "legal_hold" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { setLegalHold, getHeldUserIds } from "../services/compliance/legalHold.service";
import { getDb } from "../db";

describe("legal hold service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("places a hold and records the reason + timestamp", async () => {
    const captured: any[] = [];
    const chain: any = {
      set: (v: any) => {
        captured.push(v);
        return chain;
      },
      where: () => chain,
      returning: () => Promise.resolve([{ id: "u1" }]),
    };
    vi.mocked(getDb).mockReturnValue({ update: () => chain } as any);

    const ok = await setLegalHold("u1", true, { reason: "litigation", by: "admin-1" });
    expect(ok).toBe(true);
    expect(captured[0].legalHold).toBe(true);
    expect(captured[0].legalHoldReason).toBe("litigation");
    expect(captured[0].legalHoldAt).toBeInstanceOf(Date);
  });

  it("clears the reason/timestamp when lifting a hold", async () => {
    const captured: any[] = [];
    const chain: any = {
      set: (v: any) => {
        captured.push(v);
        return chain;
      },
      where: () => chain,
      returning: () => Promise.resolve([{ id: "u1" }]),
    };
    vi.mocked(getDb).mockReturnValue({ update: () => chain } as any);

    await setLegalHold("u1", false);
    expect(captured[0].legalHold).toBe(false);
    expect(captured[0].legalHoldReason).toBeNull();
    expect(captured[0].legalHoldAt).toBeNull();
  });

  it("returns false when the user does not exist", async () => {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve([]),
    };
    vi.mocked(getDb).mockReturnValue({ update: () => chain } as any);
    expect(await setLegalHold("missing", true)).toBe(false);
  });

  it("lists held user ids", async () => {
    const chain: any = {
      from: () => chain,
      where: () => Promise.resolve([{ id: "a" }, { id: "b" }]),
    };
    vi.mocked(getDb).mockReturnValue({ select: () => chain } as any);
    expect(await getHeldUserIds()).toEqual(["a", "b"]);
  });

  it("returns [] defensively on a query error", async () => {
    vi.mocked(getDb).mockReturnValue({
      select: () => {
        throw new Error("db down");
      },
    } as any);
    expect(await getHeldUserIds()).toEqual([]);
  });
});
