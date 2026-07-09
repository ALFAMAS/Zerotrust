import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: h.insert,
    select: h.select,
    update: h.update,
    delete: h.delete,
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: h.insert,
        select: h.select,
        update: h.update,
        delete: h.delete,
        execute: vi.fn().mockResolvedValue(undefined),
      })
    ),
  }),
}));

vi.mock("../db/rls", () => ({
  withOrgRls: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      insert: h.insert,
      select: h.select,
      update: h.update,
      delete: h.delete,
      execute: vi.fn().mockResolvedValue(undefined),
    })
  ),
}));

import { WebhookStore } from "../modules/webhooks/store";

function resetDbMocks() {
  vi.clearAllMocks();
  h.insert.mockReturnValue({ values: h.values });
  h.values.mockReturnValue({ returning: h.returning });
  h.select.mockReturnValue({ from: h.from });
  h.from.mockReturnValue({ where: h.where, orderBy: h.orderBy });
  h.where.mockReturnValue({ orderBy: h.orderBy, limit: vi.fn().mockResolvedValue([]) });
  h.orderBy.mockResolvedValue([]);
  h.update.mockReturnValue({ set: h.set });
  h.set.mockReturnValue({ where: h.where });
  h.delete.mockReturnValue({ where: h.where });
}

describe("WebhookStore persistence", () => {
  it("persists registered webhook endpoints instead of keeping them only in memory", async () => {
    resetDbMocks();
    const createdAt = new Date("2026-07-02T00:00:00Z");
    h.returning.mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        url: "https://hooks.example.test/zerotrust",
        secret: "whsec_test",
        events: ["user.created"],
        orgId: "00000000-0000-0000-0000-0000000000aa",
        active: true,
        headers: { "X-Custom": "yes" },
        retryPolicy: { maxRetries: 2, backoffMs: 500 },
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const endpoint = await new WebhookStore().registerEndpoint({
      url: "https://hooks.example.test/zerotrust",
      secret: "whsec_test",
      events: ["user.created"],
      orgId: "00000000-0000-0000-0000-0000000000aa",
      active: true,
      headers: { "X-Custom": "yes" },
      retryPolicy: { maxRetries: 2, backoffMs: 500 },
    });

    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.values).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://hooks.example.test/zerotrust",
        secret: "whsec_test",
        events: ["user.created"],
        orgId: "00000000-0000-0000-0000-0000000000aa",
        active: true,
      })
    );
    expect(endpoint).toEqual(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        events: ["user.created"],
        retryPolicy: { maxRetries: 2, backoffMs: 500 },
        createdAt,
      })
    );
  });
});
