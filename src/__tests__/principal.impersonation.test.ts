import { describe, expect, it } from "vitest";
import { describePrincipal, principalFromToken } from "../shared/principal";

describe("impersonation delegation chain (L16)", () => {
  it("records the impersonating admin in act_as", () => {
    const principal = principalFromToken({
      sub: "target-user",
      email: "user@example.com",
      scope: ["openid", "impersonation"],
      act_as: ["admin-user"],
    });
    expect(principal.actAs).toEqual(["admin-user"]);
    expect(describePrincipal(principal)).toContain("on behalf of admin-user");
  });
});
