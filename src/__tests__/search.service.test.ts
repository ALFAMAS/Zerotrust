import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  getConfig: () => ({
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
  }),
}));

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("search database fallback", () => {
  it("uses the read replica connection for database-backed search", async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) };
    const { getDb, getReadDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
    vi.mocked(getReadDb).mockReturnValue(db as any);
    const { search } = await import("../services/search.service");

    const results = await search({ query: "alice", type: "user" });

    expect(results).toEqual({ total: 0, hits: [], provider: "database" });
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });
});
