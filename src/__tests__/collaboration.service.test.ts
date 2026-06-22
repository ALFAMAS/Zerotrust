import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../api/routes/notification.routes", () => ({ broadcastNotification: vi.fn() }));
vi.mock("../services/email.service", () => ({ sendNotificationEmail: vi.fn() }));

import { getDb } from "../db";
import { globalSearch } from "../services/collaboration.service";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

// Minimal drizzle-chain fake: every builder method returns the builder, and each
// `.limit()` resolves to the next queued result set (notes query, then members).
function fakeDb(queue: unknown[][]) {
  let i = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "leftJoin", "orderBy", "offset"]) {
    builder[m] = () => builder;
  }
  builder.limit = () => Promise.resolve(queue[i++] ?? []);
  return builder;
}

beforeEach(() => getDbMock.mockReset());

describe("globalSearch — command palette backend", () => {
  it("matches navigable pages case-insensitively", async () => {
    getDbMock.mockReturnValue(fakeDb([]));
    const results = await globalSearch("u1", null, "secur");
    expect(results.some((r) => r.type === "page" && r.title === "Security")).toBe(true);
    expect(results.every((r) => r.type === "page")).toBe(true); // no org → pages only
  });

  it("respects the result limit", async () => {
    getDbMock.mockReturnValue(fakeDb([]));
    const results = await globalSearch("u1", null, "s", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns nothing when no page matches and there is no org context", async () => {
    getDbMock.mockReturnValue(fakeDb([]));
    expect(await globalSearch("u1", null, "zzzzzz")).toEqual([]);
  });

  it("includes org notes and members when an org context is present", async () => {
    getDbMock.mockReturnValue(
      fakeDb([
        [{ id: "n1", title: "Roadmap" }], // notes query
        [{ id: "m1", displayName: "Ada Lovelace", email: "ada@example.com" }], // members query
      ])
    );
    const results = await globalSearch("u1", "org1", "road");
    expect(results.some((r) => r.type === "note" && r.title === "Roadmap")).toBe(true);
    expect(results.some((r) => r.type === "user" && r.title === "Ada Lovelace")).toBe(true);
    const note = results.find((r) => r.type === "note");
    expect(note?.href).toBe("/dashboard/notes/n1");
  });

  it("degrades gracefully when the notes/member queries throw", async () => {
    const throwing: Record<string, unknown> = {};
    for (const m of ["select", "from", "where", "leftJoin", "orderBy", "offset"]) {
      throwing[m] = () => throwing;
    }
    throwing.limit = () => Promise.reject(new Error("relation does not exist"));
    getDbMock.mockReturnValue(throwing);
    // Pages still resolve even if the DB-backed facets fail.
    const results = await globalSearch("u1", "org1", "dashboard");
    expect(results.some((r) => r.title === "Dashboard")).toBe(true);
  });
});
