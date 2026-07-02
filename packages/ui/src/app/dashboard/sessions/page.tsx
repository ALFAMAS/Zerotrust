"use client";
import { CalendarClock, Clock, Globe, Laptop, MapPin, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";
import { api } from "../../../lib/api";

interface Session {
  id: string;
  ipAddress: string;
  country?: string;
  userAgent?: string;
  deviceFingerprint?: { platform?: string; browser?: string; os?: string; isTrusted?: boolean };
  isActive: boolean;
  isCurrent?: boolean;
  expiresAt?: string;
  lastActivityAt: string;
  createdAt?: string;
}

const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : "—");

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    api
      .get<any>("/sessions")
      .then((d) => setSessions(d.data || d.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revoke = async (id: string) => {
    if (!confirm("Revoke this session?")) return;
    await api.delete(`/sessions/${id}`).catch(() => {});
    fetchSessions();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Active Sessions
        </h1>
        <button
          type="button"
          onClick={() => {
            if (confirm("Revoke all other sessions?"))
              api
                .delete("/sessions")
                .then(() => {
                  fetchSessions();
                  window.location.href = "/login";
                })
                .catch(() => {});
          }}
          className="text-sm text-red-400 hover:text-red-300 border border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-950 transition-colors"
        >
          Revoke All
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground">No active sessions found.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const fp = session.deviceFingerprint;
            return (
              <div
                key={session.id}
                className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-4"
              >
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
                  <button
                    type="button"
                    onClick={() => revoke(session.id)}
                    className="shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-800 px-2.5 py-1 rounded-lg hover:bg-red-950 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
