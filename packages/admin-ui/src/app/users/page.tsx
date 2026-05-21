"use client";
import { useEffect, useState } from "react";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { api } from "../../lib/api";

interface User {
  _id: string;
  email: string;
  displayName: string;
  roles: string[];
  status: "active" | "suspended" | "pending" | "deleted";
  lastLoginAt?: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    api
      .get<{ users: User[] }>(`/admin/users?${params}`)
      .then((data) => setUsers((data as any).users || data as any))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [search, statusFilter]);

  const handleSuspend = async (id: string) => {
    if (!confirm("Suspend this user?")) return;
    await api.patch(`/admin/users/${id}/status`, { status: "suspended" }).catch(() => {});
    fetchUsers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    await api.delete(`/admin/users/${id}`).catch(() => {});
    fetchUsers();
  };

  const columns = [
    { key: "email", header: "Email" },
    { key: "displayName", header: "Display Name" },
    {
      key: "roles",
      header: "Roles",
      render: (row: User) => (
        <span className="text-xs text-gray-400">{row.roles.join(", ")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: User) => <Badge label={row.status} variant={row.status as any} />,
    },
    {
      key: "lastLoginAt",
      header: "Last Login",
      render: (row: User) =>
        row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: User) => (
        <div className="flex gap-2">
          <a
            href={`/users/${row._id}`}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            View
          </a>
          {row.status === "active" && (
            <button
              onClick={() => handleSuspend(row._id)}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Suspend
            </button>
          )}
          <button
            onClick={() => handleDelete(row._id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-1">Manage registered users</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <Table columns={columns as any} data={users} loading={loading} emptyMessage="No users found" />
    </div>
  );
}
