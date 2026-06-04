"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getConsent } from "@/lib/consent";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function AnalyticsScript() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(getConsent() === "accepted");

    function onConsentChange(e: Event) {
      setAccepted((e as CustomEvent<{ value: string }>).detail.value === "accepted");
    }

    window.addEventListener("za:consent-change", onConsentChange);
    window.addEventListener("storage", () => setAccepted(getConsent() === "accepted"));

    return () => {
      window.removeEventListener("za:consent-change", onConsentChange);
    };
  }, []);

  if (!accepted) return null;

  return (
    <>
      {PLAUSIBLE_DOMAIN && (
        <Script
          defer
          data-domain={PLAUSIBLE_DOMAIN}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      )}
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}</Script>
        </>
      )}
    </>
  );
}
