"use client";

import { useEffect, useState, useCallback } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const API_URL = process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000";

interface StatusData {
  status: "operational" | "degraded" | "down";
  components: Record<string, "operational" | "degraded" | "down">;
  uptimeSeconds: number;
  timestamp: string;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  operational: { dot: "bg-emerald-400", label: "Operational", text: "text-emerald-400" },
  degraded: { dot: "bg-amber-400", label: "Degraded", text: "text-amber-400" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-400" },
};

const COMPONENT_LABELS: Record<string, string> = {
  api: "API",
  database: "Database",
  cache: "Cache & rate limiting",
};

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const overall = error ? "down" : (data?.status ?? "operational");
  const style = STATUS_STYLES[overall];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">System status</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live status of all platform components. Updates every 30 seconds.
        </p>

        {/* Overall banner */}
        <div
          className={`mb-8 mt-10 flex items-center gap-4 rounded-xl border p-6 ${
            overall === "operational"
              ? "border-emerald-800/60 bg-emerald-950/30"
              : overall === "degraded"
                ? "border-amber-800/60 bg-amber-950/30"
                : "border-red-800/60 bg-red-950/30"
          }`}
        >
          <span className={`h-3.5 w-3.5 rounded-full ${style.dot} animate-pulse`} />
          <div>
            <p className={`font-medium ${style.text}`}>
              {error
                ? "API unreachable"
                : overall === "operational"
                  ? "All systems operational"
                  : overall === "degraded"
                    ? "Partial degradation"
                    : "Major outage"}
            </p>
            {lastChecked && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Components */}
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {error && (
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-sm text-foreground/80">API</span>
              <span className="flex items-center gap-2 text-sm text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Unreachable
              </span>
            </div>
          )}
          {data &&
            Object.entries(data.components).map(([key, value]) => {
              const s = STATUS_STYLES[value];
              return (
                <div key={key} className="flex items-center justify-between px-6 py-4">
                  <span className="text-sm text-foreground/80">{COMPONENT_LABELS[key] ?? key}</span>
                  <span className={`flex items-center gap-2 text-sm ${s.text}`}>
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </div>
              );
            })}
        </div>

        {data && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            API uptime: {Math.floor(data.uptimeSeconds / 3600)}h{" "}
            {Math.floor((data.uptimeSeconds % 3600) / 60)}m
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
