import { describe, it, expect, beforeEach } from "vitest";

import {
  assignVariant,
  exposeToExperiment,
  recordConversion,
  getExperimentResults,
  _resetExperiments,
  type Variant,
} from "../services/experiments.service";

const AB: Variant[] = [
  { name: "control", weight: 50 },
  { name: "treatment", weight: 50 },
];

describe("assignVariant", () => {
  it("is deterministic / sticky for the same subject", () => {
    const a = assignVariant("exp1", "user-1", AB);
    const b = assignVariant("exp1", "user-1", AB);
    expect(a).toBe(b);
    expect(["control", "treatment"]).toContain(a);
  });

  it("returns null for an empty/invalid variant list", () => {
    expect(assignVariant("exp1", "u", [])).toBeNull();
    expect(assignVariant("exp1", "u", [{ name: "x", weight: 0 }])).toBeNull();
  });

  it("respects weights roughly across many subjects", () => {
    const weighted: Variant[] = [
      { name: "a", weight: 90 },
      { name: "b", weight: 10 },
    ];
    let a = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (assignVariant("weighted", `user-${i}`, weighted) === "a") a++;
    }
    const share = a / N;
    // ~90% to "a"; allow generous tolerance for hash distribution.
    expect(share).toBeGreaterThan(0.82);
    expect(share).toBeLessThan(0.97);
  });

  it("different experiments can assign the same user differently", () => {
    // Not guaranteed for any single user, but across many the assignments
    // should not be perfectly correlated. Spot-check that both experiments
    // produce both variants over a population.
    const e1 = new Set<string>();
    const e2 = new Set<string>();
    for (let i = 0; i < 200; i++) {
      e1.add(assignVariant("expA", `u${i}`, AB)!);
      e2.add(assignVariant("expB", `u${i}`, AB)!);
    }
    expect(e1.size).toBe(2);
    expect(e2.size).toBe(2);
  });
});

describe("exposure + conversion tracking", () => {
  beforeEach(() => _resetExperiments());

  it("tracks exposures and computes conversion rate", () => {
    const variant = exposeToExperiment("checkout", "u1", AB)!;
    exposeToExperiment("checkout", "u1", AB); // same user → same variant, 2 exposures
    recordConversion("checkout", variant);

    const results = getExperimentResults("checkout");
    const row = results.find((r) => r.variant === variant)!;
    expect(row.exposures).toBe(2);
    expect(row.conversions).toBe(1);
    expect(row.conversionRate).toBeCloseTo(0.5);
  });

  it("returns [] for an unknown experiment", () => {
    expect(getExperimentResults("nope")).toEqual([]);
  });
});
