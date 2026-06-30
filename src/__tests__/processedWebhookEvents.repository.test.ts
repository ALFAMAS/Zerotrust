import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import {
  claimProcessedWebhookEvent,
  releaseProcessedWebhookEvent,
} from "../db/repositories/processedWebhookEvents.repository";

const mockGetDb = vi.mocked(getDb);

describe("processedWebhookEvents repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the consumer/event key pair is new", async () => {
    const returning = vi.fn().mockResolvedValue([{ consumer: "email", eventKey: "evt_1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    mockGetDb.mockReturnValue({ insert } as never);

    const claimed = await claimProcessedWebhookEvent({
      consumer: "email",
      eventKey: "evt_1",
      eventType: "bounce",
    });

    expect(claimed).toBe(true);
    expect(values).toHaveBeenCalledWith({
      consumer: "email",
      eventKey: "evt_1",
      eventType: "bounce",
    });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("returns false when the consumer/event key pair already exists", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    mockGetDb.mockReturnValue({ insert } as never);

    const claimed = await claimProcessedWebhookEvent({
      consumer: "email",
      eventKey: "evt_dupe",
      eventType: "complaint",
    });

    expect(claimed).toBe(false);
  });

  it("releases a claimed consumer/event key pair so a retry can reprocess it", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockReturnValue({ where });
    mockGetDb.mockReturnValue({ delete: del } as never);

    await releaseProcessedWebhookEvent({ consumer: "email", eventKey: "evt_retry" });

    expect(del).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
