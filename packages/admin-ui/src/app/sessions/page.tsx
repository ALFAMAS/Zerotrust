"use client";
import { useEffect, useState } from "react";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { api } from "../../lib/api";

interface Session {
  _id: string;
  userId: string;
  ipAddress: string;
  country?: string;
  userAgent: string;
  lastActivityAt: string;
  expiresAt: string;
  isActive: boolean;
  deviceFingerprint?: { browser?: string; os?: string };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  const fetchSessions = () => {
    setLoading(true);
    api
      .get<any>(`/admin/sessions?status=${filter}&limit=50`)
      .then((data) => setSessions(data.sessions || data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSessions(); }, [filter]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this session?")) return;
    await api.delete(`/sessions/${id}`).catch(() => {});
    fetchSessions();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Sessions</h1>
        <p className="text-gray-400 mt-1">Monitor and manage active user sessions</p>
      </div>

      <div className="flex gap-2 mb-4">
        {["active", "revoked", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              filter === f
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Table
        columns={[
          { key: "userId", header: "User ID", render: (r) => <span className="font-mono text-xs">{String(r.userId).slice(-8)}</span> },
          { key: "ipAddress", header: "IP" },
          { key: "country", header: "Country", render: (r) => String(r.country || "—") },
          { key: "device", header: "Device", render: (r) => `${r.deviceFingerprint?.browser || "—"} / ${r.deviceFingerprint?.os || "—"}` },
          { key: "lastActivityAt", header: "Last Active", render: (r) => new Date(r.lastActivityAt).toLocaleString() },
          {
            key: "isActive", header: "Status",
            render: (r) => <Badge label={r.isActive ? "Active" : "Revoked"} variant={r.isActive ? "active" : "revoked"} />,
          },
          {
            key: "actions", header: "Actions",
            render: (r) => r.isActive ? (
              <button onClick={() => handleRevoke(String(r._id))} className="text-xs text-red-400 hover:text-red-300">
                Revoke
              </button>
            ) : null,
          },
        ] as any}
        data={sessions as any}
        loading={loading}
        emptyMessage="No sessions found"
      />
    </div>
  );
}
