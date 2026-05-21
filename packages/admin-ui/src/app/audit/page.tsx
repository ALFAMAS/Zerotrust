"use client";
import { useEffect, useState } from "react";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { api } from "../../lib/api";

interface AuditLog {
  _id: string;
  action: string;
  actorEmail?: string;
  success: boolean;
  riskScore?: number;
  ipAddress?: string;
  country?: string;
  errorCode?: string;
  timestamp: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState("");

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (actionFilter) params.set("action", actionFilter);
    if (successFilter !== "") params.set("success", successFilter);
    api
      .get<any>(`/admin/audit?${params}`)
      .then((data) => setLogs(data.logs || data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, [actionFilter, successFilter]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-gray-400 mt-1">Immutable record of all system events</p>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-56"
        />
        <select
          value={successFilter}
          onChange={(e) => setSuccessFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All results</option>
          <option value="true">Success</option>
          <option value="false">Failure</option>
        </select>
      </div>

      <Table
        columns={[
          { key: "timestamp", header: "Time", render: (r) => <span className="font-mono text-xs">{new Date(r.timestamp).toLocaleString()}</span> },
          { key: "action", header: "Action", render: (r) => <span className="font-mono text-xs text-indigo-300">{r.action}</span> },
          { key: "actorEmail", header: "Actor", render: (r) => <span className="text-xs">{r.actorEmail || "—"}</span> },
          { key: "success", header: "Result", render: (r) => <Badge label={r.success ? "OK" : "Fail"} variant={r.success ? "active" : "denied"} /> },
          { key: "riskScore", header: "Risk", render: (r) => r.riskScore != null ? <span className={`text-xs ${Number(r.riskScore) > 70 ? "text-red-400" : "text-gray-300"}`}>{r.riskScore}</span> : "—" },
          { key: "ipAddress", header: "IP", render: (r) => <span className="font-mono text-xs text-gray-400">{r.ipAddress || "—"}</span> },
          { key: "view", header: "", render: (r) => <button onClick={() => setSelected(r)} className="text-xs text-indigo-400 hover:text-indigo-300">Details</button> },
        ] as any}
        data={logs as any}
        loading={loading}
        emptyMessage="No audit logs found"
      />

      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Audit Event Details</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-4 overflow-auto">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
