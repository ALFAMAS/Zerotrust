import { getConsent } from "./consent";

export const WEB_VITAL_EVENT = "za:web-vital";

export interface WebVitalMetricInput {
  name: string;
  value: number;
  delta: number;
  rating: string;
  id: string;
  navigationType: string;
}

export type WebVitalPayload = WebVitalMetricInput;

export function toWebVitalPayload(metric: WebVitalMetricInput): WebVitalPayload {
  return {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
  };
}

export function reportWebVital(metric: WebVitalMetricInput): void {
  try {
    if (getConsent() !== "accepted") return;
    window.dispatchEvent(
      new CustomEvent<WebVitalPayload>(WEB_VITAL_EVENT, {
        detail: toWebVitalPayload(metric),
      })
    );
  } catch {
    // Field telemetry is best-effort and must never affect application rendering.
  }
}
