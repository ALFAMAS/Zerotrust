import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// logger/index.ts dynamically imports "../audit/chain.js" (extensioned, to
// satisfy nodenext moduleResolution on a dynamic import()); vi.mock resolves
// by file path so the extensionless mock specifier below still intercepts it.

const insertAuditLog = vi.fn().mockResolvedValue({ id: "row-1" });
vi.mock("../audit/chain", () => ({
  insertAuditLog: (...a: unknown[]) => insertAuditLog(...a),
}));

vi.mock("../services/shared/siem.service", () => ({
  streamToSiem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    logging: { level: "error", format: "json" },
    elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zerotrust" },
  }),
}));

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

describe("auditLog() — chain persistence (C2)", () => {
  beforeEach(() => {
    vi.resetModules();
    insertAuditLog.mockClear();
    insertAuditLog.mockResolvedValue({ id: "row-1" });
  });
  afterEach(() => vi.clearAllMocks());

  it("persists every audit event into the hash-chained audit_logs table", async () => {
    const { auditLog } = await import("../logger");
    await auditLog("admin.role_granted", VALID_UUID, "target-user-id", true, { role: "admin" });

    expect(insertAuditLog).toHaveBeenCalledTimes(1);
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.role_granted",
        actorId: VALID_UUID,
        targetId: "target-user-id",
        success: true,
        resourceDetails: { role: "admin" },
      })
    );
  });

  it("nulls out actorId instead of passing a non-UUID actor into the uuid column", async () => {
    const { auditLog } = await import("../logger");
    await auditLog("billing.plan_changed", "not-a-uuid", "sub_123", true, { plan: "pro" });

    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, targetId: "sub_123" })
    );
  });

  it("records failed actions (success=false) in the chain too", async () => {
    const { auditLog } = await import("../logger");
    await auditLog("security.takeover_flagged", VALID_UUID, "victim@example.com", false);

    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, targetId: "victim@example.com" })
    );
  });

  it("captures the error message when one is supplied", async () => {
    const { auditLog } = await import("../logger");
    await auditLog("admin.impersonate", VALID_UUID, "target-id", false, undefined, new Error("boom"));

    expect(insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "boom" }));
  });

  it("never throws when the chain write fails — auditLog()'s long-standing contract", async () => {
    insertAuditLog.mockRejectedValueOnce(new Error("db unavailable"));

    const { auditLog } = await import("../logger");
    await expect(
      auditLog("admin.plan_override", VALID_UUID, "target-id", true, { plan: "enterprise" })
    ).resolves.toBeUndefined();
  });
});
