/** Risk banding for anomaly scores (0–1), shared by the admin anomaly console. */
export type RiskVariant = "success" | "warning" | "destructive";

export interface RiskBand {
  label: "Low" | "Medium" | "High";
  variant: RiskVariant;
}

/**
 * Map a 0–1 anomaly score to a human risk band + badge variant.
 * Thresholds: <0.33 Low, <0.66 Medium, otherwise High. Out-of-range inputs are
 * clamped so a malformed score can never render an undefined band.
 */
export function riskBand(score: number): RiskBand {
  const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  if (s >= 0.66) return { label: "High", variant: "destructive" };
  if (s >= 0.33) return { label: "Medium", variant: "warning" };
  return { label: "Low", variant: "success" };
}
