import { describe, it, expect } from "vitest";
import {
  principalFromToken,
  principalAuditFields,
  describePrincipal,
} from "../shared/principal";

describe("principalFromToken", () => {
  it("classifies a normal user token as human", () => {
    const p = principalFromToken({ sub: "user-1", email: "a@test.com" });
    expect(p).toEqual({ type: "human", id: "user-1", workloadId: undefined, actAs: undefined });
  });

  it("classifies an agent/workload token", () => {
    const p = principalFromToken({
      sub: "workload:bot",
      principal_type: "agent",
      workload_id: "bot",
    });
    expect(p.type).toBe("agent");
    expect(p.workloadId).toBe("bot");
  });

  it("treats a workload_id claim as an agent even without principal_type", () => {
    expect(principalFromToken({ sub: "x", workload_id: "w1" }).type).toBe("agent");
  });

  it("captures an act-as delegation chain from various claim shapes", () => {
    expect(principalFromToken({ sub: "a", act_as: "user-9" }).actAs).toEqual(["user-9"]);
    expect(principalFromToken({ sub: "a", act_as: ["u1", "u2"] }).actAs).toEqual(["u1", "u2"]);
    expect(principalFromToken({ sub: "a", actor: { sub: "user-7" } }).actAs).toEqual(["user-7"]);
  });

  it("defaults to a human 'unknown' for a missing token", () => {
    expect(principalFromToken(undefined)).toEqual({ type: "human", id: "unknown" });
  });
});

describe("principalAuditFields", () => {
  it("emits principal_type and omits empty optional fields", () => {
    expect(principalAuditFields({ type: "human", id: "u" })).toEqual({ principal_type: "human" });
  });

  it("includes workload_id and act_as when present", () => {
    expect(
      principalAuditFields({ type: "agent", id: "w", workloadId: "bot", actAs: ["u1"] })
    ).toEqual({ principal_type: "agent", workload_id: "bot", act_as: ["u1"] });
  });
});

describe("describePrincipal", () => {
  it("describes a delegated agent", () => {
    expect(
      describePrincipal({ type: "agent", id: "workload:bot", workloadId: "bot", actAs: ["user-1"] })
    ).toBe("agent bot on behalf of user-1");
  });

  it("describes a plain human", () => {
    expect(describePrincipal({ type: "human", id: "user-1" })).toBe("user user-1");
  });
});
