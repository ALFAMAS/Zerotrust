"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Badge from "@/components/Badge";

interface UserDetail {
  id: string;
  name?: string;
  email: string;
  status: "active" | "suspended" | "deleted" | string;
  createdAt: string;
  lastLoginAt?: string;
  mfa?: {
    totpEnabled?: boolean;
    emailOtpEnabled?: boolean;
    smsOtpEnabled?: boolean;
  };
  activeSessions?: number;
  sessionsCount?: number;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<UserDetail>(`/admin/users/${id}`);
        setUser(data);
      } catch {
        showToast("Failed to load user");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleForceLogout() {
    if (!confirm("Force logout all sessions for this user?")) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/users/${id}/logout`);
      setUser((u) => u ? { ...u, activeSessions: 0, sessionsCount: 0 } : u);
      showToast("All sessions revoked");
    } catch {
      showToast("Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleStatus() {
    if (!user) return;
    const newStatus = user.status === "active" ? "suspended" : "active";
    setActionLoading(true);
    try {
      await api.patch(`/admin/users/${id}`, { status: newStatus });
      setUser((u) => u ? { ...u, status: newStatus } : u);
      showToast(`User ${newStatus}`);
    } catch {
      showToast("Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await api.delete(`/admin/users/${id}`);
      showToast("User deleted");
      setTimeout(() => router.push("/users"), 800);
    } catch {
      showToast("Delete failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-gray-500">User not found.</div>
    );
  }

  const sessionCount = user.activeSessions ?? user.sessionsCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-white">User Detail</h1>
      </div>

      {/* Profile Card */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-900/60 text-2xl font-bold text-indigo-300">
            {(user.name?.[0] ?? user.email[0]).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-white">{user.name ?? user.email}</h2>
              <Badge status={user.status} />
            </div>
            {user.name && (
              <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Created {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* MFA Status */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4">
        <h3 className="font-semibold text-white">Multi-Factor Authentication</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Authenticator App (TOTP)", enabled: user.mfa?.totpEnabled },
            { label: "Email OTP", enabled: user.mfa?.emailOtpEnabled },
            { label: "SMS OTP", enabled: user.mfa?.smsOtpEnabled },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-gray-800 p-3 text-center">
              <div className={`text-lg mb-1 ${item.enabled ? "text-green-400" : "text-gray-600"}`}>
                {item.enabled ? "✓" : "✗"}
              </div>
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className={`text-xs font-medium mt-0.5 ${item.enabled ? "text-green-400" : "text-gray-600"}`}>
                {item.enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Active Sessions</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {sessionCount} session{sessionCount !== 1 ? "s" : ""} active
            </p>
          </div>
          <button
            onClick={handleForceLogout}
            disabled={actionLoading || sessionCount === 0}
            className="rounded-lg bg-orange-900/40 border border-orange-500/30 px-4 py-2 text-sm text-orange-400 hover:bg-orange-900/60 disabled:opacity-40 transition-colors"
          >
            Force logout all
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl bg-gray-900 border border-red-900/40 p-6 space-y-4">
        <h3 className="font-semibold text-red-400">Danger Zone</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleToggleStatus}
            disabled={actionLoading}
            className="rounded-lg bg-orange-900/30 border border-orange-500/30 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-900/50 disabled:opacity-50 transition-colors"
          >
            {user.status === "active" ? "Suspend User" : "Activate User"}
          </button>
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="rounded-lg bg-red-900/30 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/50 disabled:opacity-50 transition-colors"
          >
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}
