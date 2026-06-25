import { describe, expect, it } from "vitest";
import { riskBand } from "./anomaly";

describe("riskBand", () => {
  it("bands low scores", () => {
    expect(riskBand(0).label).toBe("Low");
    expect(riskBand(0.32).label).toBe("Low");
    expect(riskBand(0).variant).toBe("success");
  });

  it("bands medium scores at the 0.33 boundary", () => {
    expect(riskBand(0.33).label).toBe("Medium");
    expect(riskBand(0.65).label).toBe("Medium");
    expect(riskBand(0.5).variant).toBe("warning");
  });

  it("bands high scores at the 0.66 boundary", () => {
    expect(riskBand(0.66).label).toBe("High");
    expect(riskBand(1).label).toBe("High");
    expect(riskBand(0.9).variant).toBe("destructive");
  });

  it("clamps out-of-range / malformed scores instead of returning undefined", () => {
    expect(riskBand(5).label).toBe("High");
    expect(riskBand(-1).label).toBe("Low");
    expect(riskBand(Number.NaN).label).toBe("Low");
  });
});
