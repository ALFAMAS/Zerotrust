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
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.OPENAI_API_KEY;
});

describe("search database fallback", () => {
  it("uses the read replica connection for database-backed search", async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) };
    const { getDb, getReadDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
    vi.mocked(getReadDb).mockReturnValue(db as any);
    const { search } = await import("../services/ops/search.service");

    const results = await search({ query: "alice", type: "user" });

    expect(results).toEqual({ total: 0, hits: [], provider: "database" });
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });
});

describe("smart search", () => {
  it("uses a single ranked database query instead of the old embedding placeholder fallback", async () => {
    process.env.EMBEDDING_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const db = {
      execute: vi.fn().mockResolvedValue([
        {
          id: "ticket-1",
          type: "ticket",
          title: "Cannot receive magic links",
          highlight: "Magic link delivery fails for one domain",
          score: "1.25",
        },
      ]),
    };
    const { getDb, getReadDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
    vi.mocked(getReadDb).mockReturnValue(db as any);
    const { smartSearch } = await import("../services/ops/search.service");

    const results = await smartSearch({ query: "magic link", limit: 5 });

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(results).toEqual({
      total: 1,
      provider: "database",
      hits: [
        {
          id: "ticket-1",
          type: "ticket",
          title: "Cannot receive magic links",
          highlight: "Magic link delivery fails for one domain",
          score: 1.25,
        },
      ],
    });
  });
});
