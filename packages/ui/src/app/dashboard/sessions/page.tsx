"use client";
import { CalendarClock, Clock, Globe, Laptop, MapPin, ShieldCheck } from "lucide-react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/States";
import {
  useRevokeAllUserSessionsMutation,
  useRevokeUserSessionMutation,
  useUserSessionsListQuery,
} from "@/lib/server-state/sessions";

const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : "—");

export default function SessionsPage() {
  const sessionsQuery = useUserSessionsListQuery();
  const revokeMutation = useRevokeUserSessionMutation();
  const revokeAllMutation = useRevokeAllUserSessionsMutation();

  const sessions = sessionsQuery.data ?? [];
  const loading = sessionsQuery.isPending;

  const revoke = async (id: string) => {
    if (!confirm("Revoke this session?")) return;
    try {
      await revokeMutation.mutateAsync(id);
    } catch {
      // ignore
    }
  };

  if (sessionsQuery.error && !sessionsQuery.data) {
    return (
      <ErrorState
        message={sessionsQuery.error.message || "Failed to load sessions"}
        retry={() => void sessionsQuery.refetch()}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Active Sessions
        </h1>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Revoke all other sessions?")) {
              revokeAllMutation
                .mutateAsync()
                .then(() => {
                  window.location.href = "/login";
                })
                .catch(() => {});
            }
          }}
          disabled={revokeAllMutation.isPending}
          className="text-sm text-red-400 hover:text-red-300 border border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-950 transition-colors"
        >
          Revoke All
        </Button>
      </div>

      <ServerStateStatus
        isFetching={sessionsQuery.isFetching}
        isStale={sessionsQuery.isStale}
        hasData={Boolean(sessionsQuery.data)}
      />

      {loading ? (
        <SkeletonList count={3} />
      ) : sessions.length === 0 ? (
        <EmptyState title="No active sessions found." />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const fp = session.deviceFingerprint;
            return (
              <Card key={session.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                      <Laptop className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {fp?.browser || "Unknown browser"} on {fp?.os || "Unknown OS"}
                        </span>
                        {session.isCurrent && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            This device
                          </span>
                        )}
                        {fp?.isTrusted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                            <ShieldCheck className="h-3 w-3" /> Trusted
                          </span>
                        )}
                      </div>

                      <dl className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{session.ipAddress || "Unknown IP"}</span>
                          {session.country && <span>· {session.country}</span>}
                        </div>
                        {fp?.platform && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>{fp.platform}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Last active {fmt(session.lastActivityAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          <span>Signed in {fmt(session.createdAt)}</span>
                        </div>
                        {session.expiresAt && (
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            <span>Expires {fmt(session.expiresAt)}</span>
                          </div>
                        )}
                      </dl>

                      {session.userAgent && (
                        <p
                          className="mt-1.5 truncate text-[11px] text-muted-foreground/70"
                          title={session.userAgent}
                        >
                          {session.userAgent}
                        </p>
                      )}
                    </div>
                  </div>
                  {session.isActive && !session.isCurrent && (
                    <Button
                      variant="outline"
                      onClick={() => revoke(session.id)}
                      disabled={revokeMutation.isPending}
                      className="shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-800 px-2.5 py-1 rounded-lg hover:bg-red-950 transition-colors"
                    >
                      Revoke
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
