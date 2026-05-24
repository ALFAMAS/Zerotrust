"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Badge from "@/components/Badge";

interface Session {
  id: string;
  userId?: string;
  userEmail?: string;
  user?: { email: string };
  deviceInfo?: string;
  userAgent?: string;
  ipAddress?: string;
  ip?: string;
  createdAt: string;
  lastUsedAt?: string;
  lastActiveAt?: string;
  status?: "active" | "expired" | string;
  expiresAt?: string;
}

type TabFilter = "all" | "active" | "expired";

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
        setSessions(Array.isArray(data) ? data : data.sessions ?? []);
      } catch {
        showToast("Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRevoke(session: Session) {
    try {
      await api.delete(`/admin/sessions/${session.id}`);
      setSessions((prev) =>
        prev.map((s) => s.id === session.id ? { ...s, status: "expired" } : s)
      );
      showToast("Session revoked");
    } catch {
      showToast("Failed to revoke session");
    }
  }

  function getStatus(s: Session): string {
    if (s.status) return s.status;
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) return "expired";
    return "active";
  }

  const filtered = sessions.filter((s) => {
    if (tab === "all") return true;
    return getStatus(s) === tab;
  });

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "expired", label: "Expired" },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Sessions</h1>
        <p className="mt-1 text-sm text-gray-400">{sessions.length} total sessions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2",
              tab === t.key
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-white",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Device</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">IP</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Used</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">Loading…</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">No sessions found.</td>
                </tr>
              )}
              {!loading && filtered.map((s) => {
                const status = getStatus(s);
                const email = s.userEmail ?? s.user?.email ?? `User ${s.userId ?? "unknown"}`;
                const device = s.deviceInfo ?? s.userAgent ?? "Unknown device";
                const ip = s.ipAddress ?? s.ip ?? "—";
                const lastUsed = s.lastUsedAt ?? s.lastActiveAt;
                return (
                  <tr key={s.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-4 text-white">{email}</td>
                    <td className="px-5 py-4 text-gray-400 max-w-xs truncate" title={device}>
                      {device.length > 40 ? device.slice(0, 40) + "…" : device}
                    </td>
                    <td className="px-5 py-4 text-gray-400 font-mono text-xs">{ip}</td>
                    <td className="px-5 py-4 text-gray-400">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-4 text-gray-400">
                      {lastUsed ? new Date(lastUsed).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge status={status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      {status === "active" && (
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
