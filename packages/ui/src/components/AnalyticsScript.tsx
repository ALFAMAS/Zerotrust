"use client";

import { useEffect, useState } from "react";
import { getConsent } from "@/lib/consent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const PARTYTOWN_SCRIPT_TYPE = "text/partytown";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

function appendPartytownScript({
  id,
  src,
  defer,
  dataset,
}: {
  id: string;
  src: string;
  defer?: boolean;
  dataset?: Record<string, string>;
}): boolean {
  const existing = document.getElementById(id);
  if (existing) return false;

  const script = document.createElement("script");
  script.id = id;
  script.type = PARTYTOWN_SCRIPT_TYPE;
  script.src = src;
  if (defer) script.defer = true;
  for (const [key, value] of Object.entries(dataset ?? {})) {
    script.dataset[key] = value;
  }
  document.head.appendChild(script);
  return true;
}

function appendGaInitializer(measurementId: string): boolean {
  if (document.getElementById("google-analytics-init")) return false;

  const script = document.createElement("script");
  script.id = "google-analytics-init";
  script.type = PARTYTOWN_SCRIPT_TYPE;
  script.textContent = `window.dataLayer = window.dataLayer || [];
window.gtag = function gtag(){ window.dataLayer.push(arguments); };
window.gtag("js", new Date());
window.gtag("config", "${measurementId}");`;
  document.head.appendChild(script);
  return true;
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
    let addedPartytownScript = false;

    if (PLAUSIBLE_DOMAIN) {
      addedPartytownScript =
        appendPartytownScript({
          id: "plausible-analytics",
          src: "https://plausible.io/js/script.js",
          defer: true,
          dataset: { domain: PLAUSIBLE_DOMAIN },
        }) || addedPartytownScript;
    }

    if (GA_ID && GA_MEASUREMENT_ID_PATTERN.test(GA_ID)) {
      const gaUrl = new URL("https://www.googletagmanager.com/gtag/js");
      gaUrl.searchParams.set("id", GA_ID);
      addedPartytownScript =
        appendPartytownScript({
          id: "google-analytics",
          src: gaUrl.toString(),
        }) || addedPartytownScript;
      addedPartytownScript = appendGaInitializer(GA_ID) || addedPartytownScript;
    }

    if (addedPartytownScript) {
      window.dispatchEvent(new CustomEvent("ptupdate"));
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
