import { describe, expect, it } from "vitest";
import {
  asScopedOrgId,
  createOrgScopedContext,
  createOrgScopedRepository,
  requireOrgScopedContext,
} from "../db/repositories/orgScopedFactory";

describe("orgScopedFactory", () => {
  it("brands a non-empty org id", () => {
    const ctx = createOrgScopedContext("00000000-0000-4000-8000-000000000001");
    expect(ctx.orgId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("rejects empty org ids", () => {
    expect(() => asScopedOrgId("")).toThrow("ORG_ID_REQUIRED");
    expect(() => asScopedOrgId(null)).toThrow("ORG_ID_REQUIRED");
  });

  it("createOrgScopedRepository throws when org id is missing", () => {
    expect(() => createOrgScopedRepository("", () => ({}))).toThrow("ORG_ID_REQUIRED");
  });

  it("requireOrgScopedContext throws without org context", () => {
    expect(() => requireOrgScopedContext(undefined)).toThrow("ORG_ID_REQUIRED");
  });

  it("org-scoped repos reject empty org ids at construction", async () => {
    const { featureFlagsRepo } = await import("../db/repositories/featureFlags.repository");
    const { supportTicketsRepo } = await import("../db/repositories/supportTickets.repository");
    expect(() => featureFlagsRepo("")).toThrow("ORG_ID_REQUIRED");
    expect(() => supportTicketsRepo("  ")).toThrow("ORG_ID_REQUIRED");
  });
});
