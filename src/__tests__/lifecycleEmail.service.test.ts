import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, setD1Users, setD3Users, capturedUpdates, resetDb } = vi.hoisted(() => {
  let d1Users: any[] = [];
  let d3Users: any[] = [];
  const updates: { table: string; metadata: Record<string, unknown> }[] = [];

  const makeSelectChain = (rows: any[]): any => {
    const c: any = {};
    c.from = () => c;
    c.innerJoin = () => c;
    c.where = () => Promise.resolve(rows);
    return c;
  };

  return {
    mockDb: {
      select: (fields: Record<string, unknown>) => {
        // D1 selects `locale`, D3/D7 don't, D14 selects `trialEnd` — use the
        // shape of the requested fields to route to the right fixture.
        if ("trialEnd" in fields) return makeSelectChain([]);
        if ("locale" in fields) return makeSelectChain(d1Users);
        return makeSelectChain(d3Users);
      },
      update: () => ({
        set: (values: { metadata: Record<string, unknown> }) => {
          updates.push({ table: "users", metadata: values.metadata });
          return { where: () => Promise.resolve() };
        },
      }),
    },
    setD1Users: (rows: any[]) => {
      d1Users = rows;
    },
    setD3Users: (rows: any[]) => {
      d3Users = rows;
    },
    capturedUpdates: updates,
    resetDb: () => {
      d1Users = [];
      d3Users = [];
      updates.length = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  usersTable: {
    id: "id",
    email: "email",
    displayName: "display_name",
    locale: "locale",
    metadata: "metadata",
    createdAt: "created_at",
  },
  subscriptionsTable: { userId: "user_id", trialEnd: "trial_end" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));
vi.mock("../services/notifications/email.service", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendLifecycleEmails } from "../services/notifications/lifecycleEmail.service";

describe("lifecycleEmail.service — metadata preservation", () => {
  beforeEach(() => {
    resetDb();
    vi.clearAllMocks();
  });

  it("preserves existing metadata fields when marking a D1 email sent", async () => {
    setD1Users([
      {
        id: "u1",
        email: "u1@test.com",
        displayName: "User One",
        locale: "en",
        metadata: { deletionRequestedAt: "2026-01-01T00:00:00Z", notificationPreferences: { emailFallback: false } },
      },
    ]);

    await sendLifecycleEmails();

    expect(capturedUpdates).toHaveLength(1);
    const { metadata } = capturedUpdates[0];
    // The bug: previously `metadata` was never selected, so this write would
    // silently wipe deletionRequestedAt / notificationPreferences and any
    // other existing metadata field.
    expect(metadata.deletionRequestedAt).toBe("2026-01-01T00:00:00Z");
    expect(metadata.notificationPreferences).toEqual({ emailFallback: false });
    expect(metadata.lifecycleD1Sent).toEqual(expect.any(String));
  });

  it("defaults to an empty object when the user has no existing metadata", async () => {
    setD1Users([{ id: "u2", email: "u2@test.com", displayName: "User Two", locale: "en", metadata: null }]);

    await sendLifecycleEmails();

    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].metadata.lifecycleD1Sent).toEqual(expect.any(String));
  });

  it("preserves existing metadata for D3 (no locale field selected)", async () => {
    setD3Users([
      { id: "u3", email: "u3@test.com", displayName: "User Three", metadata: { customerSegment: "champion" } },
    ]);

    await sendLifecycleEmails();

    const d3Update = capturedUpdates.find((u) => "customerSegment" in u.metadata);
    expect(d3Update?.metadata.customerSegment).toBe("champion");
    expect(d3Update?.metadata.lifecycleD3Sent).toEqual(expect.any(String));
  });
});
