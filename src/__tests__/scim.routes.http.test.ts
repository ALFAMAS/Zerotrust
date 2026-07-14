/**
 * SCIM 2.0 router HTTP tests (DQ-3 coverage for scim.routes.ts).
 *
 * The router issues a deterministic sequence of Drizzle queries per request,
 * so the db mock is a FIFO: each awaited query consumes the next queued
 * result. Tests enqueue results in the order the handler awaits them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queue: unknown[] = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of [
    "select",
    "from",
    "where",
    "limit",
    "insert",
    "values",
    "update",
    "set",
    "delete",
    "returning",
    "orderBy",
  ]) {
    builder[m] = vi.fn(chain);
  }
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    if (queue.length === 0) return reject(new Error("scim test: query queue exhausted"));
    return resolve(queue.shift());
  };
  return builder;
}

const db = makeBuilder();

vi.mock("../db", () => ({
  getDb: vi.fn(() => db),
  getReadDb: vi.fn(() => db),
}));

vi.mock("../middleware/scimAuth", () => ({
  scimAuthMiddleware: vi.fn(async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("scimOrgId", "org-1");
    await next();
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../shared/passwordHash", () => ({
  hashPassword: vi.fn(async () => "hashed-temp-password"),
}));

import scimRouter from "../api/routes/scim.routes";

const NOW = new Date("2026-01-02T00:00:00.000Z");

function userRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "User One",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function req(path: string, init?: RequestInit) {
  return scimRouter.request(`http://scim.test${path}`, init);
}

describe("SCIM 2.0 routes", () => {
  beforeEach(() => {
    queue.length = 0;
  });

  describe("GET /Users", () => {
    it("returns an empty SCIM list when the org has no members", async () => {
      queue.push([]); // orgMemberUserIds
      const res = await req("/Users");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalResults).toBe(0);
      expect(body.Resources).toEqual([]);
    });

    it("lists org members as SCIM users", async () => {
      queue.push([{ userId: "user-1" }]); // orgMemberUserIds
      queue.push([userRow()]); // users select
      const res = await req("/Users?startIndex=1&count=50");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalResults).toBe(1);
      expect(body.Resources[0].userName).toBe("user@example.com");
      expect(body.Resources[0].active).toBe(true);
    });

    it("returns a SCIM error envelope when the db fails", async () => {
      // empty queue -> builder rejects
      const res = await req("/Users");
      expect(res.status).toBe(500);
    });
  });

  describe("GET /Users/:id", () => {
    it("404s for a user outside the org", async () => {
      queue.push([{ userId: "someone-else" }]); // members
      const res = await req("/Users/user-1");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });

    it("404s for a deleted user", async () => {
      queue.push([{ userId: "user-1" }]);
      queue.push([userRow({ status: "deleted" })]);
      const res = await req("/Users/user-1");
      expect(res.status).toBe(404);
    });

    it("returns the SCIM user for an org member", async () => {
      queue.push([{ userId: "user-1" }]);
      queue.push([userRow()]);
      const res = await req("/Users/user-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("user-1");
      expect(body.meta.location).toContain("/scim/v2/Users/user-1");
    });
  });

  describe("POST /Users", () => {
    it("400s without a userName or email", async () => {
      const res = await req("/Users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("creates a new user and adds org membership", async () => {
      queue.push([]); // user-by-email lookup: none
      queue.push([userRow({ email: "new@example.com", displayName: "new" })]); // insert returning
      queue.push([]); // existing member lookup: none
      queue.push(undefined); // member insert
      const res = await req("/Users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: "new@example.com" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.userName).toBe("new@example.com");
    });

    it("suspends an existing user provisioned with active=false and skips duplicate membership", async () => {
      queue.push([userRow()]); // user-by-email: exists
      queue.push(undefined); // status update
      queue.push([{ id: "member-1" }]); // existing member: yes
      const res = await req("/Users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: "user@example.com", active: false }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.active).toBe(false);
    });
  });

  describe("PATCH /Users/:id", () => {
    it("404s for non-members", async () => {
      queue.push([]); // members
      const res = await req("/Users/user-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      expect(res.status).toBe(404);
    });

    it("applies displayName and active updates", async () => {
      queue.push([{ userId: "user-1" }]); // members
      queue.push([userRow({ displayName: "Renamed", status: "suspended" })]); // update returning
      const res = await req("/Users/user-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Renamed", active: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Renamed");
      expect(body.active).toBe(false);
    });

    it("404s when the update matches no user row", async () => {
      queue.push([{ userId: "user-1" }]);
      queue.push([]); // update returning: nothing
      const res = await req("/Users/user-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /Users/:id", () => {
    it("removes org membership and returns 204", async () => {
      queue.push([{ id: "member-1" }]); // delete returning
      const res = await req("/Users/user-1", { method: "DELETE" });
      expect(res.status).toBe(204);
    });

    it("404s when the user was not a member", async () => {
      queue.push([]);
      const res = await req("/Users/user-1", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("Groups", () => {
    it("lists the org as a single SCIM group with members", async () => {
      queue.push([{ id: "org-1", name: "Acme", createdAt: NOW, updatedAt: NOW }]); // org
      queue.push([{ userId: "user-1" }]); // member ids
      queue.push([{ id: "user-1", displayName: "User One" }]); // member users
      const res = await req("/Groups");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalResults).toBe(1);
      expect(body.Resources[0].displayName).toBe("Acme");
      expect(body.Resources[0].members).toEqual([{ value: "user-1", display: "User One" }]);
    });

    it("returns an empty list when the org row is missing", async () => {
      queue.push([]); // org lookup
      const res = await req("/Groups");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalResults).toBe(0);
    });

    it("404s for a group id that is not the token's org", async () => {
      const res = await req("/Groups/other-org");
      expect(res.status).toBe(404);
    });

    it("returns the group by id for the token's org", async () => {
      queue.push([{ id: "org-1", name: "Acme", createdAt: NOW, updatedAt: NOW }]);
      queue.push([]); // no members
      const res = await req("/Groups/org-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("org-1");
      expect(body.members).toEqual([]);
    });
  });
});
