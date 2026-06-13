import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockSendSecurityAlertEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/email.service", () => ({
  sendSecurityAlertEmail: (...args: unknown[]) => mockSendSecurityAlertEmail(...args),
}));

import { getDb } from "../db";
import {
  recordSensitiveChange,
  assessTakeoverRisk,
  recordAndRespond,
} from "../services/accountTakeover.service";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function makeDb(selectResults: any[][]) {
  let call = 0;
  const db: any = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
  };
  db.where = vi.fn().mockImplementation(() => {
    // select chains resolve with the next queued result; update chains
    // (set called before where) resolve to undefined
    if (db.set.mock.calls.length > 0 && call >= selectResults.length) {
      return Promise.resolve(undefined);
    }
    const result = selectResults[Math.min(call, selectResults.length - 1)] ?? [];
    call++;
    return Promise.resolve(result);
  });
  return db;
}

describe("accountTakeover.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordSensitiveChange inserts a security event", async () => {
    const db = makeDb([[]]);
    (getDb as any).mockReturnValue(db);

    await recordSensitiveChange(USER_ID, "password_reset", { ipAddress: "1.2.3.4" });

    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: "password_reset", ipAddress: "1.2.3.4" })
    );
  });

  it("assessTakeoverRisk is not flagged with a single event type", async () => {
    const db = makeDb([[{ type: "password_reset" }, { type: "password_reset" }]]);
    (getDb as any).mockReturnValue(db);

    const result = await assessTakeoverRisk(USER_ID);
    expect(result.flagged).toBe(false);
    expect(result.recentEvents).toEqual(["password_reset"]);
  });

  it("assessTakeoverRisk flags two different sensitive changes in the window", async () => {
    const db = makeDb([[{ type: "password_reset" }, { type: "email_change" }]]);
    (getDb as any).mockReturnValue(db);

    const result = await assessTakeoverRisk(USER_ID);
    expect(result.flagged).toBe(true);
    expect(result.recentEvents).toContain("password_reset");
    expect(result.recentEvents).toContain("email_change");
  });

  it("recordAndRespond returns false (no action) when not flagged", async () => {
    const db = makeDb([
      [], // events query after insert → only one type
    ]);
    (getDb as any).mockReturnValue(db);

    const triggered = await recordAndRespond(USER_ID, "password_reset", {
      email: "user@example.com",
    });
    expect(triggered).toBe(false);
    expect(mockSendSecurityAlertEmail).not.toHaveBeenCalled();
  });

  it("recordAndRespond revokes sessions and alerts both addresses when flagged", async () => {
    const db = makeDb([
      [{ type: "password_reset" }, { type: "email_change" }], // assessment query
      [{ id: "session-1" }, { id: "session-2" }], // active sessions
    ]);
    (getDb as any).mockReturnValue(db);

    const triggered = await recordAndRespond(USER_ID, "email_change", {
      email: "new@example.com",
      previousEmail: "old@example.com",
      currentSessionId: "session-1",
    });

    expect(triggered).toBe(true);
    // Both old and new email get the alert
    expect(mockSendSecurityAlertEmail).toHaveBeenCalledTimes(2);
    const recipients = mockSendSecurityAlertEmail.mock.calls.map((c) => c[0]);
    expect(recipients).toContain("new@example.com");
    expect(recipients).toContain("old@example.com");
    // Sessions were revoked (update called for session-2, not the current one)
    expect(db.update).toHaveBeenCalled();
  });
});
