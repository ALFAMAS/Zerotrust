"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Session {
  id: string;
  device?: string;
  ip?: string;
  lastActiveAt?: string;
  isCurrent?: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = async () => {
    try {
      const data = await api.get<Session[]>("/sessions");
      setSessions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await api.delete(`/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await api.delete("/sessions");
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions");
    } finally {
      setRevokingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const others = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Active Sessions</h1>
          <p className="text-gray-400 text-sm mt-1">
            Devices currently signed in to your account.
          </p>
        </div>
        {others.length > 0 && (
          <button
            onClick={handleRevokeAll}
            disabled={revokingAll}
            className="border border-red-700 hover:border-red-500 text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {revokingAll ? "Revoking…" : "Revoke all other sessions"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Device
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                IP
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                Last Active
              </th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                  No active sessions found.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {session.device ?? "Unknown device"}
                      </span>
                      {session.isCurrent && (
                        <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-400 hidden sm:table-cell">
                    {session.ip ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-gray-400 hidden md:table-cell">
                    {session.lastActiveAt
                      ? new Date(session.lastActiveAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {!session.isCurrent && (
                      <button
                        onClick={() => handleRevoke(session.id)}
                        disabled={revoking === session.id}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        {revoking === session.id ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
