"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { SkeletonCard } from "@/components/Skeleton";
import { Laptop } from "lucide-react";

interface Session {
  id: string;
  ipAddress: string;
  country?: string;
  deviceFingerprint?: { browser?: string; os?: string };
  lastActivityAt: string;
  isActive: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = () => {
    setLoading(true);
    api.get<any>("/sessions").then((d) => setSessions(d.sessions || d || [])).catch(() => setSessions([])).finally(() => setLoading(false));
  };

  useEffect(() => { fetchSessions(); }, []);

  const revoke = async (id: string) => {
    if (!confirm("Revoke this session?")) return;
    await api.delete(`/sessions/${id}`).catch(() => {});
    fetchSessions();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Active Sessions</h1>
        <button
          onClick={() => { if (confirm("Revoke all other sessions?")) api.post("/auth/logout/all").then(() => { fetchSessions(); window.location.href = "/login"; }).catch(() => {}); }}
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
          {sessions.map((session) => (
            <div key={session.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                  <Laptop className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {session.deviceFingerprint?.browser || "Unknown browser"} on {session.deviceFingerprint?.os || "Unknown OS"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {session.ipAddress} {session.country ? `· ${session.country}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last active: {new Date(session.lastActivityAt).toLocaleString()}
                  </div>
                </div>
              </div>
              {session.isActive && (
                <button onClick={() => revoke(session.id)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-2.5 py-1 rounded-lg hover:bg-red-950 transition-colors">
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
