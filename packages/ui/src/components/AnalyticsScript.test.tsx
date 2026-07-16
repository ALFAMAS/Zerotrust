import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "@/lib/consent";
import { WEB_VITAL_EVENT, type WebVitalPayload } from "@/lib/webVitals";

const posthogMock = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

const ANALYTICS_SCRIPT_IDS = [
  "plausible-analytics",
  "google-analytics",
  "google-analytics-init",
];

async function renderAnalytics({
  plausibleDomain = "app.example.com",
  gaId = "G-ABC1234567",
  posthogKey = "",
  posthogHost = "",
}: {
  plausibleDomain?: string;
  gaId?: string;
  posthogKey?: string;
  posthogHost?: string;
} = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", plausibleDomain);
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", gaId);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", posthogKey);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", posthogHost);
  const { default: AnalyticsScript } = await import("./AnalyticsScript");
  return render(<AnalyticsScript />);
}

describe("AnalyticsScript Partytown integration", () => {
  const webVital: WebVitalPayload = {
    name: "LCP",
    value: 1800,
    delta: 200,
    rating: "good",
    id: "v4-lcp",
    navigationType: "navigate",
  };

  beforeEach(() => {
    localStorage.clear();
    posthogMock.capture.mockReset();
    posthogMock.init.mockReset();
    posthogMock.reset.mockReset();
    delete (window as typeof window & { dataLayer?: unknown[] }).dataLayer;
    for (const id of ANALYTICS_SCRIPT_IDS) {
      document.getElementById(id)?.remove();
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not add analytics scripts before consent is accepted", async () => {
    await renderAnalytics();

    await waitFor(() => {
      expect(document.getElementById("plausible-analytics")).toBeNull();
      expect(document.getElementById("google-analytics")).toBeNull();
      expect(document.getElementById("google-analytics-init")).toBeNull();
    });
  });

  it("adds consented Plausible and GA scripts for Partytown and notifies the worker", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await renderAnalytics();

    await waitFor(() => {
      expect(document.getElementById("plausible-analytics")).toBeInstanceOf(
        HTMLScriptElement
      );
      expect(document.getElementById("google-analytics-init")).toBeInstanceOf(
        HTMLScriptElement
      );
    });

    const plausible = document.getElementById("plausible-analytics") as HTMLScriptElement;
    const ga = document.getElementById("google-analytics") as HTMLScriptElement;
    const gaInit = document.getElementById("google-analytics-init") as HTMLScriptElement;

    expect(plausible.type).toBe("text/partytown");
    expect(plausible.dataset.domain).toBe("app.example.com");
    expect(plausible.src).toBe("https://plausible.io/js/script.js");
    expect(ga.type).toBe("text/partytown");
    expect(ga.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-ABC1234567");
    expect(gaInit.type).toBe("text/partytown");
    expect(gaInit.textContent).toContain('gtag("config", "G-ABC1234567")');
    expect(dispatch.mock.calls.some(([event]) => event.type === "ptupdate")).toBe(true);

    window.dispatchEvent(
      new CustomEvent("za:consent-change", { detail: { value: "accepted" } })
    );
    expect(document.querySelectorAll("#plausible-analytics")).toHaveLength(1);
    expect(document.querySelectorAll("#google-analytics")).toHaveLength(1);
    expect(document.querySelectorAll("#google-analytics-init")).toHaveLength(1);
  });

  it("rejects an invalid GA identifier instead of embedding it in executable code", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    await renderAnalytics({ gaId: 'G-BAD";globalThis.compromised=true//' });

    await waitFor(() => {
      expect(document.getElementById("plausible-analytics")).toBeInstanceOf(
        HTMLScriptElement
      );
    });
    expect(document.getElementById("google-analytics")).toBeNull();
    expect(document.getElementById("google-analytics-init")).toBeNull();
  });

  it("routes an accepted Web Vital to GA through the forwarded data layer", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    await renderAnalytics({ plausibleDomain: "" });
    await waitFor(() => {
      expect(document.getElementById("google-analytics-init")).toBeInstanceOf(
        HTMLScriptElement
      );
    });

    window.dispatchEvent(new CustomEvent(WEB_VITAL_EVENT, { detail: webVital }));

    expect((window as typeof window & { dataLayer: unknown[] }).dataLayer).toContainEqual({
      event: "web_vital",
      web_vital_name: "LCP",
      web_vital_value: 1800,
      web_vital_delta: 200,
      web_vital_rating: "good",
      web_vital_id: "v4-lcp",
      web_vital_navigation_type: "navigate",
    });
  });

  it("routes an accepted Web Vital only to an initialized PostHog client", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    await renderAnalytics({
      plausibleDomain: "",
      gaId: "",
      posthogKey: "ph_test",
      posthogHost: "https://posthog.example.com",
    });
    await waitFor(() => expect(posthogMock.init).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent(WEB_VITAL_EVENT, { detail: webVital }));

    expect(posthogMock.capture).toHaveBeenCalledWith("web_vital", webVital);
  });

  it("discards Web Vitals when no configured provider is ready", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    await renderAnalytics({ plausibleDomain: "", gaId: "" });

    window.dispatchEvent(new CustomEvent(WEB_VITAL_EVENT, { detail: webVital }));

    expect((window as typeof window & { dataLayer?: unknown[] }).dataLayer).toBeUndefined();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("does not let provider failures escape the event handler", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    await renderAnalytics({ plausibleDomain: "" });
    await waitFor(() => {
      expect(document.getElementById("google-analytics-init")).toBeInstanceOf(
        HTMLScriptElement
      );
    });
    (window as typeof window & { dataLayer: unknown }).dataLayer = {
      push: () => {
        throw new Error("provider failure");
      },
    };

    expect(() =>
      window.dispatchEvent(new CustomEvent(WEB_VITAL_EVENT, { detail: webVital }))
    ).not.toThrow();
  });
});
