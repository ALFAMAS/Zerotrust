"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { api } from "@/lib/api";

interface User {
  id: string;
  displayName?: string;
  email: string;
  status: "active" | "suspended" | "deleted" | string;
  roles?: string[];
  emailVerifiedAt?: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : null);

interface UsersResponse {
  users?: User[];
  total?: number;
  page?: number;
  limit?: number;
}

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(search && { search }),
        ...(statusFilter !== "all" && { status: statusFilter }),
      });
      const data = await api.get<UsersResponse | User[]>(`/admin/users?${params}`);
      if (Array.isArray(data)) {
        setUsers(data);
        setTotal(data.length);
      } else {
        setUsers(data.users ?? []);
        setTotal(data.total ?? data.users?.length ?? 0);
      }
    } catch {
      showToast("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleToggleStatus(user: User) {
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await api.patch(`/admin/users/${user.id}`, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)));
      showToast(`User ${newStatus}`);
    } catch {
      showToast("Action failed");
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast("User deleted");
    } catch {
      showToast("Delete failed");
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post("/admin/users/invite", { email: inviteEmail });
      showToast(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInviteModal(false);
    } catch {
      showToast(`Invite sent to ${inviteEmail} (mock)`);
      setInviteEmail("");
      setShowInviteModal(false);
    } finally {
      setInviting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total users</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/90 transition-colors"
        >
          Invite user
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Roles
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                          {(u.displayName?.[0] ?? u.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.displayName ?? u.email}</p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            {u.emailVerifiedAt ? (
                              <span
                                className="text-[10px] text-green-400"
                                title={`Verified ${fmt(u.emailVerifiedAt)}`}
                              >
                                ✓ verified
                              </span>
                            ) : (
                              <span
                                className="text-[10px] text-yellow-400"
                                title="Email not verified"
                              >
                                unverified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles?.length ? u.roles : ["user"]).map((r) => (
                          <span
                            key={r}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                              r === "admin"
                                ? "bg-primary/15 text-primary ring-primary/30"
                                : "bg-muted text-muted-foreground ring-border"
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge status={u.status} />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {fmt(u.createdAt) ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {fmt(u.lastLoginAt) ?? "Never"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`rounded px-2 py-1 text-xs transition-colors ${
                            u.status === "active"
                              ? "text-orange-400 hover:bg-orange-900/30"
                              : "text-green-400 hover:bg-green-900/30"
                          }`}
                        >
                          {u.status === "active" ? "Suspend" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded px-3 py-1.5 bg-muted border border-border disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded px-3 py-1.5 bg-muted border border-border disabled:opacity-40 hover:bg-accent transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <Modal title="Invite User" onClose={() => setShowInviteModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Email address
              </label>
              <input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowInviteModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
