import { describe, expect, it } from "vitest";
import { auditEntriesFromResponse, type AuditEntry } from "./auditData";

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
