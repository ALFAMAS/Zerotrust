"use client";
import { useEffect, useState } from "react";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { api } from "../../lib/api";

interface JITRequest {
  _id: string;
  userId: string;
  roleId: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "expired" | "revoked";
  requestedAt: string;
  expiresAt: string;
  approvedBy?: string;
}

export default function JITPage() {
  const [requests, setRequests] = useState<JITRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "denied">("pending");

  const fetchRequests = () => {
    setLoading(true);
    api
      .get<any>(`/admin/jit?status=${tab}&limit=50`)
      .then((data) => setRequests(data.requests || data))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRequests(); }, [tab]);

  const handleApprove = async (id: string) => {
    await api.post(`/admin/jit/${id}/approve`).catch(() => {});
    fetchRequests();
  };

  const handleDeny = async (id: string) => {
    await api.post(`/admin/jit/${id}/deny`).catch(() => {});
    fetchRequests();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">JIT Access Requests</h1>
        <p className="text-gray-400 mt-1">Review just-in-time privilege escalation requests</p>
      </div>

      <div className="flex gap-2 mb-4">
        {(["pending", "approved", "denied"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              tab === t ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Table
        columns={[
          { key: "userId", header: "User", render: (r) => <span className="font-mono text-xs">{String(r.userId).slice(-8)}</span> },
          { key: "roleId", header: "Requested Role", render: (r) => <span className="font-mono text-xs">{String(r.roleId).slice(-8)}</span> },
          { key: "reason", header: "Reason", className: "max-w-xs truncate" },
          { key: "requestedAt", header: "Requested", render: (r) => new Date(r.requestedAt).toLocaleString() },
          { key: "expiresAt", header: "Expires", render: (r) => new Date(r.expiresAt).toLocaleString() },
          {
            key: "status", header: "Status",
            render: (r) => <Badge label={r.status} variant={r.status as any} />,
          },
          {
            key: "actions", header: "Actions",
            render: (r) => r.status === "pending" ? (
              <div className="flex gap-2">
                <button onClick={() => handleApprove(String(r._id))} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">Approve</button>
                <button onClick={() => handleDeny(String(r._id))} className="text-xs text-red-400 hover:text-red-300">Deny</button>
              </div>
            ) : null,
          },
        ] as any}
        data={requests as any}
        loading={loading}
        emptyMessage={`No ${tab} requests`}
      />
    </div>
  );
}
