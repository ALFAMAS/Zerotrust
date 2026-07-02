"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { usePaginatedApi } from "@/lib/hooks/useApi";

interface Session {
  id: string;
  userId?: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  deviceFingerprint?: {
    platform?: string;
    browser?: string;
    os?: string;
    isTrusted?: boolean;
  } | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  isActive?: boolean;
  revokedAt?: string | null;
  revokedReason?: string | null;
  anomalyFlags?: unknown;
  createdAt: string;
  lastActivityAt?: string | null;
  expiresAt?: string | null;
}

type TabFilter = "all" | "active" | "expired";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

function anomalyCount(flags: unknown): number {
  if (!flags) return 0;
  if (Array.isArray(flags)) return flags.length;
  if (typeof flags === "object") return Object.keys(flags as object).length;
  return 0;
}

export default function SessionsPage() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const {
    items: sessions,
    loading,
    pagination,
    page,
    setPage,
    refetch,
  } = usePaginatedApi<Session>("/admin/sessions", {
    onError: () => showToast("Failed to load sessions"),
  });
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  async function handleRevoke(session: Session) {
    try {
      await api.delete(`/admin/sessions/${session.id}`);
      showToast("Session revoked");
      await refetch();
    } catch {
      showToast("Failed to revoke session");
    }
  }

  // "expired" here is the filter bucket for anything not currently active
  // (truly expired, manually revoked, or marked inactive).
  function isActiveSession(s: Session): boolean {
    if (s.isActive === false || s.revokedAt) return false;
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) return false;
    return true;
  }

  function statusLabel(s: Session): string {
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
