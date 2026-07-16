import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "@/lib/consent";
import { WEB_VITAL_EVENT } from "@/lib/webVitals";
import WebVitalsReporter from "./WebVitalsReporter";

const webVitalsMock = vi.hoisted(() => ({ callbacks: [] as Array<(metric: Metric) => void> }));

interface Metric {
  name: string;
  value: number;
  delta: number;
  rating: string;
  id: string;
  navigationType: string;
  entries?: unknown[];
  attribution?: unknown;
}

const metric: Metric = {
  name: "INP",
  value: 148,
  delta: 12,
  rating: "good",
  id: "v4-inp",
  navigationType: "navigate",
  entries: [{ name: "https://example.com/settings?secret=value" }],
  attribution: { element: "#password", organizationId: "org-secret" },
};

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (callback: (metric: Metric) => void) => {
    webVitalsMock.callbacks.push(callback);
  },
}));

describe("WebVitalsReporter", () => {
  beforeEach(() => {
    localStorage.clear();
    webVitalsMock.callbacks.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([null, "declined"])("discards metrics when consent is %s", (consent) => {
    if (consent) localStorage.setItem(CONSENT_KEY, consent);
    const listener = vi.fn();
    window.addEventListener(WEB_VITAL_EVENT, listener);

    render(<WebVitalsReporter />);
    expect(() => webVitalsMock.callbacks.at(-1)?.(metric)).not.toThrow();
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(WEB_VITAL_EVENT, listener);
  });

  it("emits one minimal internal event after consent", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const listener = vi.fn();
    window.addEventListener(WEB_VITAL_EVENT, listener);

    render(<WebVitalsReporter />);
    webVitalsMock.callbacks.at(-1)?.(metric);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: "INP",
      value: 148,
      delta: 12,
      rating: "good",
      id: "v4-inp",
      navigationType: "navigate",
    });
    window.removeEventListener(WEB_VITAL_EVENT, listener);
  });

  it("keeps the Next.js report callback stable and isolates dispatch failures", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const first = render(<WebVitalsReporter />);
    first.rerender(<WebVitalsReporter />);

    expect(webVitalsMock.callbacks[0]).toBe(webVitalsMock.callbacks[1]);
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("listener failure");
    });
    expect(() => webVitalsMock.callbacks.at(-1)?.(metric)).not.toThrow();
  });
});
