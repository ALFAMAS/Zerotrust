import { describe, expect, it } from "vitest";
import { paginated, parsePaginatedQuery } from "../shared/pagination";

describe("shared/pagination", () => {
  describe("parsePaginatedQuery", () => {
    it("applies defaults when page/limit are missing", () => {
      expect(parsePaginatedQuery({})).toEqual({ page: 1, limit: 20, offset: 0 });
    });

    it("parses numeric strings and computes offset", () => {
      expect(parsePaginatedQuery({ page: "3", limit: "10" })).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      });
    });

    it("clamps invalid page to 1 and enforces max limit", () => {
      expect(parsePaginatedQuery({ page: "-1", limit: "999" })).toEqual({
        page: 1,
        limit: 200,
        offset: 0,
      });
    });

    it("honours custom defaultLimit and maxLimit", () => {
      expect(parsePaginatedQuery({ limit: "50" }, { defaultLimit: 5, maxLimit: 25 })).toEqual({
        page: 1,
        limit: 25,
        offset: 0,
      });
    });

    it("reads query from a Hono-style object with .query()", () => {
      const honoLike = {
        query: () => ({ page: "2", limit: "5" }),
      };
      expect(parsePaginatedQuery(honoLike)).toEqual({ page: 2, limit: 5, offset: 5 });
    });

    it("falls back to defaults when a query function throws", () => {
      expect(parsePaginatedQuery(() => {
        throw new Error("boom");
      })).toEqual({ page: 1, limit: 20, offset: 0 });
    });
  });

  describe("paginated", () => {
    it("builds pagination metadata with hasNext/hasPrev flags", () => {
      const res = paginated(["a", "b"], { page: 2, limit: 2, total: 5 });
      expect(res.data).toEqual(["a", "b"]);
      expect(res.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("marks hasNext false on the last page", () => {
      const res = paginated([], { page: 3, limit: 2, total: 5 });
      expect(res.pagination.hasNext).toBe(false);
      expect(res.pagination.hasPrev).toBe(true);
    });

    it("never returns negative totals", () => {
      const res = paginated([], { page: 1, limit: 10, total: -3 });
      expect(res.pagination.total).toBe(0);
      expect(res.pagination.totalPages).toBe(0);
    });
  });
});
