"use client";

import { Fingerprint, KeyRound, Shield } from "lucide-react";
import MetricCard from "@/components/admin/MetricCard";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { useAnalyticsQuery } from "@/lib/server-state/admin/analytics";

export default function AdminAnalyticsPage() {
  const analyticsQuery = useAnalyticsQuery();
  const data = analyticsQuery.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cohort retention, auth-method mix, and anomaly trends
          </p>
        </div>
        <ServerStateStatus query={analyticsQuery} />
      </div>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={KeyRound}
              label="Password auth"
              value={String(data.authMethodMix.password)}
            />
            <MetricCard
              icon={Shield}
              label="OAuth connected"
              value={String(data.authMethodMix.oauth)}
            />
            <MetricCard
              icon={Fingerprint}
              label="Passkeys"
              value={String(data.authMethodMix.passkey)}
            />
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Weekly cohort retention</h2>
            {data.cohorts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough signup data yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2">Cohort week</th>
                      <th className="px-4 py-2">Size</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i} className="px-2 py-2">
                          W{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((row) => (
                      <tr key={row.cohortWeek} className="border-b border-border/60">
                        <td className="px-4 py-2 font-mono text-xs">{row.cohortWeek}</td>
                        <td className="px-4 py-2">{row.cohortSize}</td>
                        {row.retention.map((pct, i) => (
                          <td key={i} className="px-2 py-2 text-center text-xs">
                            {pct}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Anomaly-flagged sessions (30d)
            </h2>
            {data.anomalyTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flagged sessions in this window.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                {data.anomalyTrends.map((pt) => (
                  <div key={pt.date} className="flex flex-col items-center gap-1">
                    <div
                      className="w-4 rounded-sm bg-amber-500/80"
                      style={{ height: `${Math.max(8, pt.flaggedSessions * 4)}px` }}
                      title={`${pt.date}: ${pt.flaggedSessions}`}
                    />
                    <span className="text-[10px] text-muted-foreground">{pt.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
