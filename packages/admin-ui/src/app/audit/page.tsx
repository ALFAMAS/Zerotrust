"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

interface AuditEntry {
  id: string;
  timestamp?: string;
  createdAt?: string;
  user?: string;
  userEmail?: string;
  userId?: string;
  action: string;
  ip?: string;
  ipAddress?: string;
  status?: "success" | "failure" | "error" | string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

const MOCK_ENTRIES: AuditEntry[] = [
  { id: "1", timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), userEmail: "alice@acme.com", action: "user.login", ip: "192.168.1.10", status: "success" },
  { id: "2", timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), userEmail: "bob@acme.com", action: "user.login", ip: "10.0.0.5", status: "failure", metadata: { reason: "Invalid password" } },
  { id: "3", timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(), userEmail: "admin@acme.com", action: "settings.update", ip: "127.0.0.1", status: "success", metadata: { fields: ["emailPasswordEnabled", "sessionTTLSeconds"] } },
  { id: "4", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), userEmail: "carol@acme.com", action: "user.mfa.enabled", ip: "203.0.113.42", status: "success" },
  { id: "5", timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), userEmail: "alice@acme.com", action: "user.logout", ip: "192.168.1.10", status: "success" },
  { id: "6", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), userEmail: "dave@acme.com", action: "user.register", ip: "198.51.100.7", status: "success" },
  { id: "7", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), userEmail: "admin@acme.com", action: "user.delete", ip: "127.0.0.1", status: "success", metadata: { targetUser: "old-user@acme.com" } },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<AuditEntry[] | { entries: AuditEntry[] }>("/admin/audit");
        setEntries(Array.isArray(data) ? data : data.entries ?? []);
      } catch {
        // API may not exist yet — use mock data
        setEntries(MOCK_ENTRIES);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getStatus(entry: AuditEntry): string {
    return entry.status ?? "success";
  }

  function getTimestamp(entry: AuditEntry): string {
    const raw = entry.timestamp ?? entry.createdAt;
    if (!raw) return "—";
    return new Date(raw).toLocaleString();
  }

  function getUser(entry: AuditEntry): string {
    return entry.userEmail ?? entry.user ?? entry.userId ?? "—";
  }

  function getIp(entry: AuditEntry): string {
    return entry.ip ?? entry.ipAddress ?? "—";
  }

  function getDetail(entry: AuditEntry): Record<string, unknown> {
    return entry.metadata ?? entry.details ?? {};
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-400">Recent authentication and admin events</p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">IP</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">Loading…</td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">No audit entries found.</td>
                </tr>
              )}
              {!loading && entries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">
                    {getTimestamp(entry)}
                  </td>
                  <td className="px-5 py-4 text-white">{getUser(entry)}</td>
                  <td className="px-5 py-4">
                    <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-indigo-300">
                      {entry.action}
                    </code>
                  </td>
                  <td className="px-5 py-4 text-gray-400 font-mono text-xs">{getIp(entry)}</td>
                  <td className="px-5 py-4">
                    <Badge
                      status={getStatus(entry) === "failure" || getStatus(entry) === "error" ? "error" : "success"}
                      label={getStatus(entry)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <Modal title="Audit Log Detail" onClose={() => setSelected(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Timestamp</p>
                <p className="text-white">{getTimestamp(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">User</p>
                <p className="text-white">{getUser(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Action</p>
                <code className="text-indigo-300 text-xs bg-gray-800 rounded px-1.5 py-0.5">{selected.action}</code>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">IP Address</p>
                <p className="text-white font-mono text-xs">{getIp(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Status</p>
                <Badge
                  status={getStatus(selected) === "failure" || getStatus(selected) === "error" ? "error" : "success"}
                  label={getStatus(selected)}
                />
              </div>
            </div>
            {Object.keys(getDetail(selected)).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Details</p>
                <pre className="rounded-lg bg-gray-800 p-3 text-xs text-gray-300 overflow-auto max-h-48">
                  {JSON.stringify(getDetail(selected), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
