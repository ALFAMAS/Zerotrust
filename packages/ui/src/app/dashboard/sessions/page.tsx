"use client";

import { CalendarClock, Clock, Globe, Laptop, MapPin, ShieldCheck } from "lucide-react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
        <PageHeader title={<>Active Sessions</>} />
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
          className="min-h-11 rounded-lg border border-destructive px-3 py-2 text-sm text-danger-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger-subtle-foreground"
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
                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                      <Laptop className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {fp?.browser || "Unknown browser"} on {fp?.os || "Unknown OS"}
                        </span>
                        {session.isCurrent && (
                          <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                            This device
                          </span>
                        )}
                        {fp?.isTrusted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-success-subtle-foreground">
                            <ShieldCheck className="h-3 w-3" /> Trusted
                          </span>
                        )}
                      </div>

                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{session.ipAddress || "Unknown IP"}</span>
                          {session.country && <span>· {session.country}</span>}
                        </div>
                        {fp?.platform && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>{fp.platform}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Last active {fmt(session.lastActivityAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          <span>Signed in {fmt(session.createdAt)}</span>
                        </div>
                        {session.expiresAt && (
                          <div className="flex items-center gap-2">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            <span>Expires {fmt(session.expiresAt)}</span>
                          </div>
                        )}
                      </dl>

                      {session.userAgent && (
                        <p
                          className="mt-2 truncate text-xs text-muted-foreground/70"
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
                      className="min-h-11 shrink-0 rounded-lg border border-destructive px-3 py-2 text-xs text-danger-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger-subtle-foreground"
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
