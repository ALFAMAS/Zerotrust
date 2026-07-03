import { describe, expect, it } from "vitest";
import { hasOrgPermission, ORG_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "../shared/permissions";

describe("shared/permissions", () => {
  it("exposes a stable permission catalog", () => {
    expect(ORG_PERMISSIONS).toContain("members:read");
    expect(SYSTEM_ROLE_PERMISSIONS.owner).toContain("billing:manage");
    expect(SYSTEM_ROLE_PERMISSIONS.viewer).toEqual(["members:read"]);
  });

  it("grants owner every manage permission", () => {
    expect(hasOrgPermission("owner", null, "roles:manage")).toBe(true);
    expect(hasOrgPermission("owner", null, "billing:manage")).toBe(true);
  });

  it("denies admin billing:manage but allows invites:manage", () => {
    expect(hasOrgPermission("admin", null, "billing:manage")).toBe(false);
    expect(hasOrgPermission("admin", null, "invites:manage")).toBe(true);
  });

  it("limits member to read-only billing/settings", () => {
    expect(hasOrgPermission("member", null, "billing:view")).toBe(true);
    expect(hasOrgPermission("member", null, "settings:manage")).toBe(false);
  });

  it("honours custom role permissions when role is custom", () => {
    expect(hasOrgPermission("custom", ["audit:view"], "audit:view")).toBe(true);
    expect(hasOrgPermission("custom", ["audit:view"], "billing:manage")).toBe(false);
  });

  it("fails closed for unknown system roles", () => {
    expect(hasOrgPermission("contractor", null, "members:read")).toBe(false);
  });
});
