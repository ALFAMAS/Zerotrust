"use client";

import { useCallback, useEffect, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { apiGet } from "@/lib/apiClient";

const API_URL = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:3000";

interface StatusData {
  status: "operational" | "degraded" | "down";
  components: Record<string, "operational" | "degraded" | "down" | "not set">;
  uptimeSeconds: number;
  timestamp: string;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  operational: {
    dot: "bg-emerald-400",
    label: "Operational",
    text: "text-emerald-400",
  },
  degraded: { dot: "bg-amber-400", label: "Degraded", text: "text-amber-400" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-400" },
  "not set": { dot: "bg-zinc-500", label: "Not set", text: "text-zinc-400" },
};

const COMPONENT_LABELS: Record<string, string> = {
  api: "API",
  database: "Database",
  cache: "Cache & rate limiting",
  s3Backup: "Database backups (S3)",
  s3ObjectStorage: "Object storage (S3)",
};

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<StatusData>("/status", { skipAuth: true });
      setData(data);
      setError(false);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // SSE for real-time status updates (replaces 30s polling)
  useEffect(() => {
    const es = new EventSource(`${API_URL}/status/stream`);
    es.onmessage = (e) => {
      try {
        const statusData = JSON.parse(e.data);
        setData(statusData);
        setError(false);
        setLastChecked(new Date());
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      setError(true);
      // EventSource will auto-reconnect
    };
    return () => es.close();
  }, []);

  const overall = error ? "down" : (data?.status ?? "operational");
  const style = STATUS_STYLES[overall];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">System status</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live status of all platform components. Updates in real-time.
        </p>

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
                Last updated {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

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
