import { describe, expect, it } from "vitest";
import { PLAN_CONFIGS, PLANS, planAllows, planLimit, type Plan } from "../shared/plans";

describe("shared/plans", () => {
  it("defines the three canonical plan tiers", () => {
    expect(PLANS).toEqual(["free", "pro", "enterprise"]);
    for (const plan of PLANS) {
      expect(PLAN_CONFIGS[plan].name).toBeTruthy();
      expect(PLAN_CONFIGS[plan].priceMonthly).toBeGreaterThanOrEqual(0);
    }
  });

  it("planAllows returns boolean feature flags and treats numeric limits as allowed when non-zero", () => {
    expect(planAllows("free", "customRoles")).toBe(false);
    expect(planAllows("pro", "customRoles")).toBe(true);
    expect(planAllows("enterprise", "ssoSaml")).toBe(true);
    expect(planAllows("free", "apiKeys")).toBe(true);
    expect(planAllows("free", "unknownFeature")).toBe(false);
  });

  it("planAllows fails closed for unknown plans", () => {
    expect(planAllows("invalid" as Plan, "customRoles")).toBe(false);
  });

  it("planLimit returns numeric caps and Infinity for unlimited enterprise tiers", () => {
    expect(planLimit("free", "apiKeys")).toBe(2);
    expect(planLimit("pro", "apiCallsPerMonth")).toBe(1_000_000);
    expect(planLimit("enterprise", "apiKeys")).toBe(-1);
    expect(planLimit("enterprise", "orgMembers")).toBe(-1);
  });

  it("planLimit returns 0 for unknown features or plans", () => {
    expect(planLimit("free", "missingFeature")).toBe(0);
    expect(planLimit("invalid" as Plan, "apiKeys")).toBe(0);
  });
});
