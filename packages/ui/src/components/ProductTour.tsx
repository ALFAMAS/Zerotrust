"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * First-login product tour — a lightweight, dependency-free spotlight
 * walkthrough. Each step optionally targets a `[data-tour="…"]` element and
 * dims the rest of the screen; steps without a target render centered.
 *
 * Completion is stored in localStorage under a versioned key so it shows once.
 * Bump TOUR_VERSION to re-run the tour after meaningful dashboard changes.
 */
const TOUR_VERSION = "v1";
const STORAGE_KEY = `za_product_tour_${TOUR_VERSION}`;

interface TourStep {
  /** CSS selector of the element to spotlight. Omit for a centered step. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to ZeroAuth 👋",
    body: "A quick tour of the essentials. It takes about 20 seconds — you can skip anytime.",
  },
  {
    target: '[data-tour="nav-/dashboard/security"]',
    title: "Lock down your account",
    body: "Set up MFA, passkeys and review recent security events from the Security page.",
  },
  {
    target: '[data-tour="nav-/dashboard/api-keys"]',
    title: "Build with the API",
    body: "Create scoped API keys to authenticate your apps and services against ZeroAuth.",
  },
  {
    target: '[data-tour="nav-/dashboard/notifications"]',
    title: "Stay in the loop",
    body: "Enable push notifications and email fallback so you never miss a security alert.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function ProductTour() {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Defer so the dashboard shell has painted before we measure targets.
        const t = setTimeout(() => setActive(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable (private mode) — just skip the tour.
    }
  }, []);

  const measure = useCallback(() => {
    const sel = STEPS[step]?.target;
    if (!sel) {
      setRect(null);
      return;
    }
    const el = document.querySelector(sel);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setActive(false);
  }

  if (!mounted || !active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const pad = 6;

  // Position the tooltip near the spotlight, or centered when there's no target.
  const tooltipStyle: React.CSSProperties = rect
    ? {
        top: Math.min(rect.top + rect.height + 12, window.innerHeight - 220),
        left: Math.min(Math.max(rect.left, 12), window.innerWidth - 332),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Dimming overlay (click-through prevented). A spotlight cut-out is drawn
          via a ring box when a target exists. */}
      <button
        type="button"
        aria-label="Skip tour"
        className="absolute inset-0 bg-black/60"
        onClick={finish}
      />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      )}

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-popover p-5 shadow-2xl"
        style={tooltipStyle}
      >
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
          {current.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Skip
            </button>
            <Button size="sm" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
