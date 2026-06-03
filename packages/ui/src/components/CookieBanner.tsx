"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brand } from "@/config/brand";

const CONSENT_KEY = "za_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Delay slightly so the slide-in transition is visible
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  }

  function handleDecline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  }

  // Avoid SSR mismatch — render nothing until mounted on client
  if (!mounted) return null;

  return (
    <div
      className={[
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-out",
        visible ? "translate-y-0" : "translate-y-full",
      ].join(" ")}
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        <p className="text-sm text-gray-400 leading-relaxed">
          {brand.name} uses cookies to improve your experience. By continuing, you accept our{" "}
          <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">
            Terms of Service
          </Link>
          .
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
