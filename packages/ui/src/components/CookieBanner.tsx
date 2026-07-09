"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getConsent, setConsent } from "@/lib/consent";
import { cn } from "@/lib/utils";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!getConsent()) {
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleAccept() {
    setConsent("accepted");
    setVisible(false);
  }

  function handleDecline() {
    setConsent("declined");
    setVisible(false);
  }

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-out",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 border-t border-border bg-card px-6 py-4 sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {brand.name} uses cookies to improve your experience. By continuing, you accept our{" "}
          <Link
            href="/privacy"
            className="text-indigo-300 underline underline-offset-2 transition-colors hover:text-indigo-200"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link
            href="/terms"
            className="text-indigo-300 underline underline-offset-2 transition-colors hover:text-indigo-200"
          >
            Terms of Service
          </Link>
          .
        </p>
        <div className="flex flex-shrink-0 items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            Decline
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
