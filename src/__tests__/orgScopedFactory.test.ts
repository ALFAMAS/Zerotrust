import { describe, expect, it } from "vitest";
import { asScopedOrgId, createOrgScopedContext } from "../db/repositories/orgScopedFactory";

describe("orgScopedFactory", () => {
  it("brands a non-empty org id", () => {
    const ctx = createOrgScopedContext("00000000-0000-4000-8000-000000000001");
    expect(ctx.orgId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("rejects empty org ids", () => {
    expect(() => asScopedOrgId("")).toThrow("ORG_ID_REQUIRED");
    expect(() => asScopedOrgId(null)).toThrow("ORG_ID_REQUIRED");
  });
});
