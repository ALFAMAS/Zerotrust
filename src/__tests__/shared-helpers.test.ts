import { describe, expect, it, vi } from "vitest";
import { countRows } from "../shared/dbCount";
import { internalError } from "../shared/httpErrors";
import { hasAnyRole, hasRole, isAdmin } from "../shared/roles";

// ─── roles ──────────────────────────────────────────────────────────────────

describe("shared/roles", () => {
  it("hasRole returns true only when the role is present", () => {
    expect(hasRole({ roles: ["admin", "user"] }, "admin")).toBe(true);
    expect(hasRole({ roles: ["user"] }, "admin")).toBe(false);
  });

  it("hasRole fails closed for missing / non-array / null bearers", () => {
    expect(hasRole({}, "admin")).toBe(false);
    expect(hasRole({ roles: null }, "admin")).toBe(false);
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole(undefined, "admin")).toBe(false);
    // Defends against a non-array roles value that would throw on `.includes`.
    expect(hasRole({ roles: "admin" as unknown as string[] }, "admin")).toBe(false);
  });

  it("hasAnyRole matches when at least one role overlaps", () => {
    expect(hasAnyRole({ roles: ["support"] }, ["admin", "support"])).toBe(true);
    expect(hasAnyRole({ roles: ["user"] }, ["admin", "support"])).toBe(false);
    expect(hasAnyRole(null, ["admin"])).toBe(false);
  });

  it("isAdmin is a shorthand for the admin role", () => {
    expect(isAdmin({ roles: ["admin"] })).toBe(true);
    expect(isAdmin({ roles: ["user"] })).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

// ─── httpErrors ───────────────────────────────────────────────────────────────

describe("shared/httpErrors", () => {
  function fakeCtx() {
    return {
      json: vi.fn((body: unknown, status?: number) => ({ body, status })),
    };
  }
  function fakeLogger() {
    return { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  }

  it("logs the error and returns the 500 envelope with a client message", () => {
    const c = fakeCtx();
    const logger = fakeLogger();
    const err = new Error("boom");
    const res = internalError(c as never, logger as never, "Widget error", err, "Failed to widget");

    expect(logger.error).toHaveBeenCalledWith("Widget error", err);
    expect(c.json).toHaveBeenCalledWith(
      { error: "INTERNAL_ERROR", message: "Failed to widget" },
      500
    );
    expect(res).toEqual({ body: { error: "INTERNAL_ERROR", message: "Failed to widget" }, status: 500 });
  });

  it("omits the message when none is provided", () => {
    const c = fakeCtx();
    const logger = fakeLogger();
    internalError(c as never, logger as never, "Bare error", "not-an-error-object");

    expect(logger.error).toHaveBeenCalledWith("Bare error", "not-an-error-object");
    expect(c.json).toHaveBeenCalledWith({ error: "INTERNAL_ERROR" }, 500);
  });
});

// ─── dbCount ──────────────────────────────────────────────────────────────────

describe("shared/dbCount", () => {
  function fakeDb(rows: unknown) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    return chain;
  }

  it("returns the count from the first row", async () => {
    const db = fakeDb([{ count: 42 }]);
    const total = await countRows(db as never, {} as never);
    expect(total).toBe(42);
    expect(db.select).toHaveBeenCalled();
  });

  it("returns 0 when the result set is empty", async () => {
    const db = fakeDb([]);
    expect(await countRows(db as never, {} as never)).toBe(0);
  });

  it("forwards an optional where clause to the query builder", async () => {
    const db = fakeDb([{ count: 3 }]);
    const where = { sql: "x = 1" };
    await countRows(db as never, {} as never, where as never);
    expect(db.where).toHaveBeenCalledWith(where);
  });
});
