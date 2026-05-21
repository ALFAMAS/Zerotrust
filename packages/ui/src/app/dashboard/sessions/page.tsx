"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

interface Session {
  _id: string;
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
        <h1 className="text-2xl font-bold text-white">Active Sessions</h1>
        <button
          onClick={() => { if (confirm("Revoke all other sessions?")) api.post("/auth/logout/all").then(() => { fetchSessions(); window.location.href = "/login"; }).catch(() => {}); }}
          className="text-sm text-red-400 hover:text-red-300 border border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-950 transition-colors"
        >
          Revoke All
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500">No active sessions found.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session._id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-0.5">💻</div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {session.deviceFingerprint?.browser || "Unknown browser"} on {session.deviceFingerprint?.os || "Unknown OS"}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {session.ipAddress} {session.country ? `· ${session.country}` : ""}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Last active: {new Date(session.lastActivityAt).toLocaleString()}
                  </div>
                </div>
              </div>
              {session.isActive && (
                <button onClick={() => revoke(session._id)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-2.5 py-1 rounded-lg hover:bg-red-950 transition-colors">
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
