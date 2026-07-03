import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getAuditChainTip: vi.fn(),
  getDb: vi.fn(),
  getReadDb: vi.fn(),
  isS3BackupEnabled: vi.fn(),
  getS3Config: vi.fn(),
}));

vi.mock("../audit/chain", () => ({
  getAuditChainTip: h.getAuditChainTip,
}));

vi.mock("../db", () => ({
  getDb: h.getDb,
  getReadDb: h.getReadDb,
}));

vi.mock("../shared/s3Config", () => ({
  isS3BackupEnabled: h.isS3BackupEnabled,
  getS3Config: h.getS3Config,
}));

import { computeAnchorHash, runAuditAnchor, verifyAuditAnchors } from "../audit/anchor";

function makeBuilder(queue: unknown[][] = []) {
  let i = 0;
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isS3BackupEnabled.mockReturnValue(false);
  process.env.AUDIT_ANCHOR_ENABLED = "true";
  process.env.NODE_ENV = "test";
});

describe("audit anchor", () => {
  it("skips when AUDIT_ANCHOR_ENABLED is not true", async () => {
    process.env.AUDIT_ANCHOR_ENABLED = "false";
    const result = await runAuditAnchor();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(h.getAuditChainTip).not.toHaveBeenCalled();
  });

  it("skips when no chained audit rows exist", async () => {
    h.getAuditChainTip.mockResolvedValue(null);
    const read = makeBuilder();
    h.getReadDb.mockReturnValue(read);

    const result = await runAuditAnchor();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("no chained");
  });

  it("records a new anchor for the chain tip", async () => {
    h.getAuditChainTip.mockResolvedValue({ seq: 42, entryHash: "abc123" });
    const read = makeBuilder([[]]);
    const write = makeBuilder([[{ id: "anchor-1" }]]);
    h.getReadDb.mockReturnValue(read);
    h.getDb.mockReturnValue(write);

    const result = await runAuditAnchor();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(result.anchorId).toBe("anchor-1");
    expect(result.latestSeq).toBe(42);
    expect(write.insert).toHaveBeenCalled();
  });

  it("skips when chain tip unchanged since last anchor", async () => {
    h.getAuditChainTip.mockResolvedValue({ seq: 42, entryHash: "abc123" });
    const read = makeBuilder([
      [
        {
          id: "prev",
          anchoredAt: new Date("2026-07-01T00:00:00.000Z"),
          environment: "test",
          latestSeq: 42,
          latestEntryHash: "abc123",
          previousAnchorHash: null,
          anchorHash: "deadbeef",
          externalKey: null,
          createdAt: new Date(),
        },
      ],
    ]);
    h.getReadDb.mockReturnValue(read);

    const result = await runAuditAnchor();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(h.getDb).not.toHaveBeenCalled();
  });

  it("verify passes when anchor matches chain tip", async () => {
    const anchoredAt = new Date("2026-07-03T12:00:00.000Z");
    h.getAuditChainTip.mockResolvedValue({ seq: 5, entryHash: "tip-hash" });

    const body = {
      system: "zerotrust" as const,
      environment: "test",
      anchoredAt: anchoredAt.toISOString(),
      latestSeq: 5,
      latestEntryHash: "tip-hash",
      previousAnchorHash: null as string | null,
    };
    const anchorHash = computeAnchorHash(null, body);

    const read = makeBuilder([
      [
        {
          id: "a1",
          anchoredAt,
          environment: "test",
          latestSeq: 5,
          latestEntryHash: "tip-hash",
          previousAnchorHash: null,
          anchorHash,
          externalKey: null,
          createdAt: anchoredAt,
        },
      ],
    ]);
    h.getReadDb.mockReturnValue(read);

    const result = await verifyAuditAnchors();
    expect(result.ok).toBe(true);
    expect(result.chainTip?.seq).toBe(5);
  });

  it("verify fails when chain tip advanced past anchor", async () => {
    h.getAuditChainTip.mockResolvedValue({ seq: 10, entryHash: "new-tip" });
    const anchoredAt = new Date("2026-07-03T12:00:00.000Z");
    const body = {
      system: "zerotrust" as const,
      environment: "test",
      anchoredAt: anchoredAt.toISOString(),
      latestSeq: 5,
      latestEntryHash: "old-tip",
      previousAnchorHash: null as string | null,
    };
    const anchorHash = computeAnchorHash(null, body);
    const read = makeBuilder([
      [
        {
          id: "a1",
          anchoredAt,
          environment: "test",
          latestSeq: 5,
          latestEntryHash: "old-tip",
          previousAnchorHash: null,
          anchorHash,
          externalKey: null,
          createdAt: anchoredAt,
        },
      ],
    ]);
    h.getReadDb.mockReturnValue(read);

    const result = await verifyAuditAnchors();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not match");
  });
});
