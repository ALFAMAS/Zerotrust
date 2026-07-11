import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRows = [
  {
    id: "log-1",
    seq: 1,
    action: "user.login",
    actorId: "u1",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    prevHash: "0".repeat(64),
    entryHash: "deadbeef",
  },
];

vi.mock("../audit/chain", () => ({
  getAuditChainTip: vi.fn().mockResolvedValue({ seq: 42, entryHash: "abc123" }),
}));

vi.mock("../db", () => ({
  getReadDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(mockRows),
        }),
      }),
    }),
  })),
}));

import { buildSignedNdjsonExport, signExportPayload } from "../services/compliance/auditExport.service";

describe("auditExport.service", () => {
  beforeEach(() => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = "test-signing-key";
  });

  it("signExportPayload produces stable HMAC", () => {
    const sig = signExportPayload('{"type":"test"}\n');
    const expected = createHmac("sha256", "test-signing-key").update('{"type":"test"}\n').digest("hex");
    expect(sig).toBe(expected);
  });

  it("buildSignedNdjsonExport returns signed NDJSON with header line", async () => {
    const result = await buildSignedNdjsonExport({ limit: 10 });
    expect(result.rowCount).toBe(1);
    expect(result.exportId).toBeTruthy();
    expect(result.signature).toBe(signExportPayload(result.ndjson));
    const lines = result.ndjson.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const header = JSON.parse(lines[0]!);
    expect(header.type).toBe("zerotrust.audit.export");
    expect(header.chainTip).toEqual({ seq: 42, entryHash: "abc123" });
  });
});
