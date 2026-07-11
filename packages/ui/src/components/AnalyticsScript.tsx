"use client";

import { useEffect, useState } from "react";
import { getConsent } from "@/lib/consent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function appendExternalScript({
  id,
  src,
  defer,
  dataset,
}: {
  id: string;
  src: string;
  defer?: boolean;
  dataset?: Record<string, string>;
}) {
  const existing = document.getElementById(id);
  if (existing) return existing;

  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;
  if (defer) script.defer = true;
  for (const [key, value] of Object.entries(dataset ?? {})) {
    script.dataset[key] = value;
  }
  document.head.appendChild(script);
  return script;
}

export default function AnalyticsScript() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(getConsent() === "accepted");

    function onConsentChange(e: Event) {
      setAccepted((e as CustomEvent<{ value: string }>).detail.value === "accepted");
    }

    function onStorage() {
      setAccepted(getConsent() === "accepted");
    }

    window.addEventListener("za:consent-change", onConsentChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("za:consent-change", onConsentChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!accepted) return;

    if (PLAUSIBLE_DOMAIN) {
      appendExternalScript({
        id: "plausible-analytics",
        src: "https://plausible.io/js/script.js",
        defer: true,
        dataset: { domain: PLAUSIBLE_DOMAIN },
      });
    }

    if (GA_ID) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = (...args: unknown[]) => {
        window.dataLayer?.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_ID);

      appendExternalScript({
        id: "google-analytics",
        src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`,
      });
    }

    if (POSTHOG_KEY && POSTHOG_HOST) {
      let cancelled = false;
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled) return;
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          person_profiles: "identified_only",
          capture_pageview: true,
        });
      });

      return () => {
        cancelled = true;
        void import("posthog-js").then(({ default: posthog }) => posthog.reset());
      };
    }
  }, [accepted]);

  return null;
}
