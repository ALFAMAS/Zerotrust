import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  insertAuditLog: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock("../db/repositories/processedWebhookEvents.repository", () => ({
  claimProcessedWebhookEvent: h.claim,
  releaseProcessedWebhookEvent: h.release,
}));

vi.mock("../audit/chain", () => ({
  insertAuditLog: h.insertAuditLog,
}));

vi.mock("../middleware/sessionControl", () => ({
  revokeSession: h.revokeSession,
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { handleSSFEvent } from "../modules/ssf/receiver";

describe("handleSSFEvent - idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.claim.mockResolvedValue(true);
    h.release.mockResolvedValue(undefined);
    h.insertAuditLog.mockResolvedValue(undefined);
    h.revokeSession.mockResolvedValue(undefined);
  });

  it("claims a provider event id before applying SSF side effects", async () => {
    const result = await handleSSFEvent({
      jti: "ssf_evt_1",
      type: "compromise",
      severity: "critical",
      actorId: "user-1",
      targetSessionId: "session-1",
      details: { provider: "issuer.example" },
    });

    expect(result).toEqual({ handled: true });
    expect(h.claim).toHaveBeenCalledWith({
      consumer: "ssf",
      eventKey: "ssf_evt_1",
      eventType: "compromise",
    });
    expect(h.insertAuditLog).toHaveBeenCalledTimes(1);
    expect(h.revokeSession).toHaveBeenCalledWith("session-1", "SSF_COMPROMISE");
  });

  it("skips a duplicate SSF event without writing audit or revoking again", async () => {
    h.claim.mockResolvedValue(false);

    const result = await handleSSFEvent({
      jti: "ssf_evt_duplicate",
      type: "compromise",
      severity: "critical",
      targetSessionId: "session-1",
    });

    expect(result).toEqual({ handled: true, duplicate: true });
    expect(h.insertAuditLog).not.toHaveBeenCalled();
    expect(h.revokeSession).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("falls back to a content hash when the provider has no event id", async () => {
    const result = await handleSSFEvent({
      type: "session-revoked",
      severity: "medium",
      targetSessionId: "session-hash",
    });

    expect(result).toEqual({ handled: true });
    expect(h.claim).toHaveBeenCalledWith({
      consumer: "ssf",
      eventKey: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      eventType: "session-revoked",
    });
  });

});
