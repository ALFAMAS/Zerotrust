import { describe, expect, it } from "vitest";
import {
  auditEntriesFromResponse,
  auditVolumeByDay,
  type AuditEntry,
} from "./auditData";

describe("auditVolumeByDay", () => {
  it("returns zero-filled buckets for the requested window", () => {
    const rows = auditVolumeByDay([], 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.count === 0)).toBe(true);
  });

  it("counts entries on their UTC calendar day", () => {
    // Yesterday (UTC) is always inside the 14-day window regardless of run date.
    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const day = yesterday.toISOString().slice(0, 10);
    const entries: AuditEntry[] = [
      { id: "1", action: "login", createdAt: `${day}T10:00:00.000Z` },
      { id: "2", action: "logout", createdAt: `${day}T18:30:00.000Z` },
      { id: "3", action: "login", createdAt: "2019-01-01T00:00:00.000Z" },
    ];

    const rows = auditVolumeByDay(entries, 14);
    const match = rows.find((row) => row.date.toISOString().startsWith(day));
    expect(match?.count).toBe(2);
  });
});

describe("auditEntriesFromResponse", () => {
  it("keeps an empty API response empty instead of injecting sample rows", () => {
    expect(auditEntriesFromResponse({ data: [], pagination: { total: 0 } })).toEqual([]);
  });

  it("returns rows from paginated and array responses", () => {
    const row: AuditEntry = {
      id: "audit-1",
      action: "admin.user.update",
      actorEmail: "admin@example.com",
    };

    expect(auditEntriesFromResponse({ data: [row] })).toEqual([row]);
    expect(auditEntriesFromResponse([row])).toEqual([row]);
  });
});
