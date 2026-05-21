"use client";
import { useEffect, useState } from "react";
import { Badge } from "../../../components/Badge";
import { Table } from "../../../components/Table";
import { api } from "../../../lib/api";

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get(`/admin/users/${params.id}`),
      api.get(`/admin/sessions?userId=${params.id}&limit=10`),
      api.get(`/admin/audit?actorId=${params.id}&limit=20`),
    ]).then(([u, s, a]) => {
      if (u.status === "fulfilled") setUser(u.value);
      if (s.status === "fulfilled") setSessions((s.value as any).sessions || s.value);
      if (a.status === "fulfilled") setAudit((a.value as any).logs || a.value);
    }).finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="text-gray-400 p-8">Loading...</div>;
  }

  if (!user) {
    return <div className="text-red-400 p-8">User not found</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/users" className="text-gray-400 hover:text-white text-sm">← Back to Users</a>
        <h1 className="text-2xl font-bold text-white mt-2">{user.displayName}</h1>
        <p className="text-gray-400">{user.email}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">Profile</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-gray-400">Status</dt><dd className="mt-1"><Badge label={user.status} variant={user.status} /></dd></div>
            <div><dt className="text-gray-400">Roles</dt><dd className="text-gray-300 mt-1">{user.roles?.join(", ") || "—"}</dd></div>
            <div><dt className="text-gray-400">Last Login</dt><dd className="text-gray-300 mt-1">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</dd></div>
            <div><dt className="text-gray-400">Joined</dt><dd className="text-gray-300 mt-1">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</dd></div>
          </dl>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">MFA Status</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-gray-400">TOTP</dt>
              <dd><Badge label={user.mfa?.totp?.enabled ? "Enabled" : "Disabled"} variant={user.mfa?.totp?.enabled ? "active" : "default"} /></dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-400">WebAuthn</dt>
              <dd><Badge label={user.mfa?.webauthn?.enabled ? "Enabled" : "Disabled"} variant={user.mfa?.webauthn?.enabled ? "active" : "default"} /></dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-400">Passkeys</dt>
              <dd className="text-gray-300">{user.passkeys?.length || 0}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">OAuth Providers</h2>
          {user.oauthProviders?.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {user.oauthProviders.map((p: any) => (
                <li key={p.provider} className="flex items-center gap-2 text-gray-300">
                  <span className="text-indigo-400">•</span> {p.provider}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No OAuth providers connected</p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="font-semibold text-white mb-4">Recent Audit Events</h2>
        <Table
          columns={[
            { key: "timestamp", header: "Time", render: (r: any) => new Date(r.timestamp).toLocaleString() },
            { key: "action", header: "Action" },
            { key: "success", header: "Result", render: (r: any) => <Badge label={r.success ? "Success" : "Failure"} variant={r.success ? "active" : "denied"} /> },
            { key: "ipAddress", header: "IP" },
          ]}
          data={audit}
          emptyMessage="No audit events"
        />
      </div>
    </div>
  );
}
