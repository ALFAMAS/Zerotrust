"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker and bridges connectivity events to it.
 *
 * - Registers `/sw.js` on mount (production only — a dev SW would cache the
 *   Next.js dev assets and fight HMR).
 * - On `online`, nudges the SW to flush any writes queued while offline, for
 *   browsers without the Background Sync API.
 * - Listens for the SW's `WRITE_QUEUE_FLUSHED` message and refreshes the page
 *   data so the UI reflects synced changes.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal — the app works without offline support.
    });

    const flush = () => {
      navigator.serviceWorker.controller?.postMessage({ type: "FLUSH_WRITE_QUEUE" });
    };

    const onMessage = (event: MessageEvent) => {
      if (cancelled) return;
      if (event.data?.type === "WRITE_QUEUE_FLUSHED") {
        // Pull fresh server state now that queued writes landed.
        window.location.reload();
      }
    };

    window.addEventListener("online", flush);
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      window.removeEventListener("online", flush);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
