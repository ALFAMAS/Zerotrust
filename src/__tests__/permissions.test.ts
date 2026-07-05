import { describe, expect, it } from "vitest";
import {
  assertCan,
  AuthorizationError,
  authorizeOrg,
  hasOrgPermission,
  ORG_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from "../shared/permissions";

const ORG = "00000000-0000-0000-0000-0000000000b1";
const USER = "00000000-0000-0000-0000-0000000000a1";

function membership(role: string): { orgId: string; userId: string; role: string } {
  return { orgId: ORG, userId: USER, role };
}

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

describe("assertCan (SEC-5)", () => {
  it("denies unauthenticated principals", () => {
    expect(() =>
      assertCan(null, "org:read", { type: "org", orgId: ORG }, { membership: membership("member") })
    ).toThrow(AuthorizationError);
  });

  it("denies non-members", () => {
    expect(() =>
      assertCan({ id: USER }, "org:read", { type: "org", orgId: ORG }, { membership: null })
    ).toThrow(/Not a member/);
  });

  it("allows members to read org", () => {
    expect(() =>
      assertCan({ id: USER }, "org:read", { type: "org", orgId: ORG }, { membership: membership("member") })
    ).not.toThrow();
  });

  it("requires owner for delete and transfer", () => {
    expect(() =>
      assertCan({ id: USER }, "org:delete", { type: "org", orgId: ORG }, { membership: membership("admin") })
    ).toThrow(/Owner role required/);
    expect(() =>
      assertCan({ id: USER }, "org:transfer", { type: "org", orgId: ORG }, { membership: membership("owner") })
    ).not.toThrow();
  });

  it("requires admin for org update and invite management", () => {
    expect(() =>
      assertCan({ id: USER }, "org:update", { type: "org", orgId: ORG }, { membership: membership("member") })
    ).toThrow(/Admin role required/);
    expect(() =>
      assertCan({ id: USER }, "invites:manage", { type: "org", orgId: ORG }, { membership: membership("admin") })
    ).not.toThrow();
  });

  it("authorizeOrg loads membership then asserts", async () => {
    const loaded = await authorizeOrg({ id: USER }, "members:read", ORG, async () =>
      membership("viewer")
    );
    expect(loaded.role).toBe("viewer");
  });
});
