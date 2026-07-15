"use client";

import { ServerStateStatus } from "@/components/ServerStateStatus";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/States";
import { useStatusHistoryQuery, useStatusQuery, useStatusStream } from "@/lib/server-state/status";

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  operational: {
    dot: "bg-success",
    label: "Operational",
    text: "text-success-subtle-foreground",
  },
  degraded: { dot: "bg-warning", label: "Degraded", text: "text-warning-subtle-foreground" },
  down: { dot: "bg-destructive", label: "Down", text: "text-danger-subtle-foreground" },
  "not set": { dot: "bg-muted", label: "Not set", text: "text-muted-foreground" },
};

const COMPONENT_LABELS: Record<string, string> = {
  api: "API",
  database: "Database",
  cache: "Cache & rate limiting",
  s3Backup: "Database backups (S3)",
  s3ObjectStorage: "Object storage (S3)",
};

function StatusHeading() {
  return (
    <PageHeader
      title="System status"
      description="Live status of all platform components. Updates in real time."
    />
  );
}

export default function StatusPage() {
  const statusQuery = useStatusQuery();
  const historyQuery = useStatusHistoryQuery(90);
  useStatusStream(!statusQuery.isError);

  const data = statusQuery.data ?? null;
  const error = Boolean(statusQuery.error && !statusQuery.data);
  const lastChecked = statusQuery.dataUpdatedAt ? new Date(statusQuery.dataUpdatedAt) : null;

  const overall = error ? "down" : (data?.status ?? "operational");
  const style = STATUS_STYLES[overall];

  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
          <StatusHeading />
          <p className="mt-8 text-sm text-muted-foreground" aria-live="polite">
            Loading system status…
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
          <StatusHeading />
          <div className="mt-8">
            <ErrorState
              message="We couldn't reach the status service. Check your connection and try again."
              retry={() => void statusQuery.refetch()}
            />
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <StatusHeading />

        <ServerStateStatus
          isFetching={statusQuery.isFetching}
          isStale={statusQuery.isStale}
          hasData={Boolean(statusQuery.data)}
        />

        <div
          className={`mb-8 mt-8 flex items-center gap-4 rounded-xl border p-6 ${
            overall === "operational"
              ? "border-success bg-success-subtle"
              : overall === "degraded"
                ? "border-warning bg-warning-subtle"
                : "border-destructive bg-danger-subtle"
          }`}
        >
          <span className={`h-3.5 w-3.5 rounded-full ${style.dot}`} aria-hidden="true" />
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
              <p className="mt-1 text-xs text-muted-foreground">
                Last updated {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {error && (
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-sm text-foreground/80">API</span>
              <span className="flex items-center gap-2 text-sm text-danger-subtle-foreground">
                <span className="h-2 w-2 rounded-full bg-destructive" />
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

        {historyQuery.data && historyQuery.data.history.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-foreground">90-day uptime history</h2>
            <ul aria-label="Daily uptime snapshots" className="flex flex-wrap gap-1">
              {historyQuery.data.history.map((snap) => (
                <li
                  key={snap.date}
                  aria-label={`${snap.date}: ${STATUS_STYLES[snap.status]?.label ?? snap.status}`}
                  title={`${snap.date}: ${snap.status}`}
                  className={`h-8 w-2 rounded-sm ${
                    snap.status === "operational"
                      ? "bg-success/80"
                      : snap.status === "degraded"
                        ? "bg-warning/80"
                        : "bg-destructive/80"
                  }`}
                />
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Every daily snapshot includes its date and status label.
            </p>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
