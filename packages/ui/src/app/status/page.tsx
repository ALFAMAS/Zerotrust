"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000";

interface StatusData {
  status: "operational" | "degraded" | "down";
  components: Record<string, "operational" | "degraded" | "down">;
  uptimeSeconds: number;
  timestamp: string;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  operational: { dot: "bg-green-400", label: "Operational", text: "text-green-400" },
  degraded: { dot: "bg-yellow-400", label: "Degraded", text: "text-yellow-400" },
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-20">
        <h1 className="text-2xl font-bold mb-2">System status</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Live status of all platform components. Updates every 30 seconds.
        </p>

        {/* Overall banner */}
        <div
          className={`rounded-xl border p-6 mb-8 flex items-center gap-4 ${
            overall === "operational"
              ? "bg-green-950/40 border-green-800"
              : overall === "degraded"
                ? "bg-yellow-950/40 border-yellow-800"
                : "bg-red-950/40 border-red-800"
          }`}
        >
          <span className={`h-3.5 w-3.5 rounded-full ${style.dot} animate-pulse`} />
          <div>
            <p className={`font-semibold ${style.text}`}>
              {error
                ? "API unreachable"
                : overall === "operational"
                  ? "All systems operational"
                  : overall === "degraded"
                    ? "Partial degradation"
                    : "Major outage"}
            </p>
            {lastChecked && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Components */}
        <div className="bg-card border border-border rounded-xl divide-y divide-gray-800">
          {error && (
            <div className="px-6 py-4 flex items-center justify-between">
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
                <div key={key} className="px-6 py-4 flex items-center justify-between">
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
          <p className="mt-6 text-xs text-muted-foreground text-center">
            API uptime: {Math.floor(data.uptimeSeconds / 3600)}h{" "}
            {Math.floor((data.uptimeSeconds % 3600) / 60)}m
          </p>
        )}
      </div>
    </main>
  );
}
