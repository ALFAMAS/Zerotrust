import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));
vi.mock("../middleware/rateLimiting", () => ({
  rateLimit: () => async (_c: any, next: any) => next(),
}));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ID = "00000000-0000-0000-0000-000000000002";
const TICKET_ID = "00000000-0000-0000-0000-0000000000aa";

function makeDbChain(ret: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(ret),
    limit: vi.fn().mockResolvedValue(ret),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(ret),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  chain.transaction = vi.fn(async (callback: (tx: typeof chain) => unknown) => callback(chain));
  return chain;
}

function makeTicket(o: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    userId: USER_ID,
    orgId: null,
    subject: "Cannot log in",
    status: "open",
    priority: "normal",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

async function getApp(db: any, userId = USER_ID, roles: string[] = ["user"]) {
  vi.resetModules();
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db);
  vi.mocked(getReadDb).mockReturnValue(db);
  vi.doMock("../middleware/auth", () => ({
    authMiddleware: async (c: any, next: any) => {
      c.set("user", { id: userId, email: "u@test.com", roles });
      return next();
    },
  }));
  const { default: router } = await import("../api/routes/support.routes");
  return new Hono().route("/support", router);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock("../middleware/auth");
});

describe("POST /support", () => {
  it("opens a ticket with its first message", async () => {
    const db = makeDbChain();
    db.returning
      .mockResolvedValueOnce([makeTicket()]) // ticket insert
      .mockResolvedValueOnce([{ id: "m1", ticketId: TICKET_ID, authorRole: "user", body: "Help" }]);
    const app = await getApp(db);
    const res = await app.request("/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "Cannot log in", message: "Help" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.id).toBe(TICKET_ID);
    expect(body.messages[0].authorRole).toBe("user");
  });

  it("rejects an empty subject", async () => {
    const app = await getApp(makeDbChain());
    const res = await app.request("/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "", message: "Help" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /support", () => {
  it("lists only the caller's tickets by default", async () => {
    const db = makeDbChain([makeTicket()]);
    const app = await getApp(db);
    const res = await app.request("/support");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe("mine");
    // a userId filter must be applied
    expect(db.where).toHaveBeenCalled();
  });

  it("ignores ?all=true for non-agents (still scoped to caller)", async () => {
    const db = makeDbChain([makeTicket()]);
    const app = await getApp(db, USER_ID, ["user"]);
    const res = await app.request("/support?all=true");
    const body = await res.json();
    expect(body.scope).toBe("mine");
  });

  it("honors ?all=true for agents", async () => {
    const db = makeDbChain([makeTicket(), makeTicket({ userId: OTHER_ID })]);
    const app = await getApp(db, "agent-1", ["admin"]);
    const res = await app.request("/support?all=true");
    const body = await res.json();
    expect(body.scope).toBe("all");
  });
});

describe("GET /support/:id", () => {
  it("returns 403 when the ticket belongs to someone else", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ userId: OTHER_ID })]);
    const app = await getApp(db, USER_ID, ["user"]);
    const res = await app.request(`/support/${TICKET_ID}`);
    expect(res.status).toBe(403);
  });

  it("returns the thread for an agent on any ticket", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ userId: OTHER_ID })]);
    db.orderBy.mockResolvedValueOnce([{ id: "m1", body: "hi", authorRole: "user" }]);
    const app = await getApp(db, "agent-1", ["admin"]);
    const res = await app.request(`/support/${TICKET_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
  });
});

describe("POST /support/:id/messages", () => {
  it("an agent reply sets status to pending and authorRole agent", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ userId: OTHER_ID, status: "open" })]);
    db.returning.mockResolvedValueOnce([{ id: "m2", authorRole: "agent", body: "On it" }]);
    const app = await getApp(db, "agent-1", ["support"]);
    const res = await app.request(`/support/${TICKET_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "On it" }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).message.authorRole).toBe("agent");
    const setArg = db.set.mock.calls.at(-1)?.[0];
    expect(setArg.status).toBe("pending");
  });

  it("refuses replies on a closed ticket", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ status: "closed" })]);
    const app = await getApp(db);
    const res = await app.request(`/support/${TICKET_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "still broken" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("TICKET_CLOSED");
  });
});

describe("PATCH /support/:id", () => {
  it("lets the owner close their ticket", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ status: "open" })]);
    db.returning.mockResolvedValueOnce([makeTicket({ status: "closed" })]);
    const app = await getApp(db);
    const res = await app.request(`/support/${TICKET_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ticket.status).toBe("closed");
  });

  it("forbids an owner from setting pending (agents only)", async () => {
    const db = makeDbChain();
    db.limit.mockResolvedValueOnce([makeTicket({ status: "open" })]);
    const app = await getApp(db, USER_ID, ["user"]);
    const res = await app.request(`/support/${TICKET_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    expect(res.status).toBe(403);
  });
});
