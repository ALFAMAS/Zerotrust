"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import Badge from "@/components/Badge";
import { api } from "@/lib/api";

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.get<Session[] | { sessions: Session[] }>("/admin/sessions");
        setSessions(Array.isArray(data) ? data : (data.sessions ?? []));
      } catch {
        showToast("Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  async function handleRevoke(session: Session) {
    try {
      await api.delete(`/admin/sessions/${session.id}`);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id
            ? {
                ...s,
                isActive: false,
                revokedAt: new Date().toISOString(),
                revokedReason: "ADMIN_REVOKED",
              }
            : s
        )
      );
      showToast("Session revoked");
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
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Sessions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{sessions.length} total sessions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Device
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Location
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Active
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    No sessions found.
                  </td>
                </tr>
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
                  return (
                    <tr key={s.id} className="hover:bg-accent/50 transition-colors align-top">
                      <td className="px-5 py-4 text-foreground">
                        <div className="font-medium">
                          {s.userEmail ?? `User ${s.userId ?? "unknown"}`}
                        </div>
                        {s.userDisplayName && (
                          <div className="text-xs text-muted-foreground">{s.userDisplayName}</div>
                        )}
                      </td>
                      <td
                        className="px-5 py-4 text-muted-foreground"
                        title={s.userAgent ?? undefined}
                      >
                        <div className="flex items-center gap-1.5 text-foreground">
                          {deviceLabel}
                          {fp?.isTrusted && (
                            <span title="Trusted device">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                            </span>
                          )}
                        </div>
                        {fp?.platform && <div className="text-xs">{fp.platform}</div>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div className="font-mono text-xs">{s.ipAddress ?? "—"}</div>
                        {s.country && <div className="text-xs">{s.country}</div>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-xs">
                        {fmt(s.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-xs">
                        {fmt(s.lastActivityAt)}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-xs">
                        {fmt(s.expiresAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <Badge status={active ? "active" : "expired"} label={label} />
                          {label === "revoked" && s.revokedReason && (
                            <span className="text-[10px] text-muted-foreground">
                              {s.revokedReason}
                            </span>
                          )}
                          {anomalies > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-400"
                              title="Anomaly flags raised for this session"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {anomalies} {anomalies === 1 ? "anomaly" : "anomalies"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {active && (
                          <button
                            onClick={() => handleRevoke(s)}
                            className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
