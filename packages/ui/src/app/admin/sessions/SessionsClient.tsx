"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminSessionsListQuery,
  useRevokeAdminSessionMutation,
} from "@/lib/server-state/sessions";
import type { AdminSession } from "@/lib/server-state/types";

type TabFilter = "all" | "active" | "expired";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

function anomalyCount(flags: unknown): number {
  if (!flags) return 0;
  if (Array.isArray(flags)) return flags.length;
  if (typeof flags === "object") return Object.keys(flags as object).length;
  return 0;
}

export default function SessionsClient() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const sessionsQuery = useAdminSessionsListQuery({ page, limit: 20 });
  const revokeMutation = useRevokeAdminSessionMutation({ page, limit: 20 });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const sessions = sessionsQuery.data?.data ?? [];
  const pagination = sessionsQuery.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const loading = sessionsQuery.isLoading;
  const error = sessionsQuery.error;

  async function handleRevoke(session: AdminSession) {
    try {
      await revokeMutation.mutateAsync(session.id);
      showToast("Session revoked");
    } catch {
      showToast("Failed to revoke session");
    }
  }

  function isActiveSession(s: AdminSession): boolean {
    if (s.isActive === false || s.revokedAt) return false;
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) return false;
    return true;
  }

  function statusLabel(s: AdminSession): string {
    if (s.revokedAt) return "revoked";
    if (!isActiveSession(s)) return "expired";
    return "active";
  }

  const filtered = sessions.filter((s) => {
    if (tab === "all") return true;
    return tab === "active" ? isActiveSession(s) : !isActiveSession(s);
  });

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "expired", label: "Expired" },
  ];

  if (error && !sessionsQuery.data) {
    return (
      <ErrorState
        message={error.message || "Failed to load sessions"}
        retry={() => void sessionsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Sessions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} total sessions</p>
      </div>

      <ServerStateStatus
        isFetching={sessionsQuery.isFetching}
        isStale={sessionsQuery.isStale}
        hasData={sessions.length > 0}
        label="sessions"
        onRefresh={() => void sessionsQuery.refetch()}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Button
            type="button"
            key={t.key}
            variant="ghost"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tab === "all"
              ? "All sessions"
              : tab === "active"
                ? "Active sessions"
                : "Inactive sessions"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No sessions found.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filtered.map((s) => {
                    const fp = s.deviceFingerprint;
                    const active = isActiveSession(s);
                    const label = statusLabel(s);
                    const anomalies = anomalyCount(s.anomalyFlags);
                    const deviceLabel =
                      fp?.browser || fp?.os
                        ? `${fp?.browser || "Unknown"} on ${fp?.os || "Unknown OS"}`
                        : s.userAgent || "Unknown device";
                    const badgeVariant =
                      label === "revoked" ? "destructive" : active ? "success" : "secondary";
                    return (
                      <TableRow key={s.id} className="align-top">
                        <TableCell className="text-foreground">
                          <div className="font-medium">
                            {s.userEmail ?? `User ${s.userId ?? "unknown"}`}
                          </div>
                          {s.userDisplayName && (
                            <div className="text-xs text-muted-foreground">{s.userDisplayName}</div>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground"
                          title={s.userAgent ?? undefined}
                        >
                          <div className="flex items-center gap-1.5 text-foreground">
                            {deviceLabel}
                            {fp?.isTrusted && (
                              <span title="Trusted device">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                              </span>
                            )}
                          </div>
                          {fp?.platform && <div className="text-xs">{fp.platform}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="font-mono text-xs">{s.ipAddress ?? "—"}</div>
                          {s.country && <div className="text-xs">{s.country}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(s.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(s.lastActivityAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(s.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={badgeVariant}>{label}</Badge>
                            {label === "revoked" && s.revokedReason && (
                              <span className="text-[10px] text-muted-foreground">
                                {s.revokedReason}
                              </span>
                            )}
                            {anomalies > 0 && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500"
                                title="Anomaly flags raised for this session"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {anomalies} {anomalies === 1 ? "anomaly" : "anomalies"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {active && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevoke(s)}
                              disabled={
                                revokeMutation.isPending && revokeMutation.variables === s.id
                              }
                              className="text-destructive hover:text-destructive"
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
