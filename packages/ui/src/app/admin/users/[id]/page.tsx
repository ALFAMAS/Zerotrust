"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Badge from "@/components/Badge";
import { api } from "@/lib/api";

interface UserDetail {
  id: string;
  displayName?: string;
  username?: string | null;
  phone?: string | null;
  email: string;
  status: "active" | "suspended" | "deleted" | string;
  roles?: string[];
  locale?: string;
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  mfa?: {
    totpEnabled?: boolean;
    webauthnEnabled?: boolean;
  };
  passkeyCount?: number;
  oauthProviders?: string[];
  activeSessions?: number;
  sessionsCount?: number;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

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
    // biome-ignore lint/correctness/useExhaustiveDependencies: loads on mount / when the route key changes; closes over stable setters
  }, [id, showToast]);

  async function handleForceLogout() {
    if (!confirm("Force logout all sessions for this user?")) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/users/${id}/logout`);
      setUser((u) => (u ? { ...u, activeSessions: 0, sessionsCount: 0 } : u));
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
      setUser((u) => (u ? { ...u, status: newStatus } : u));
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
      setTimeout(() => router.push("/admin/users"), 800);
    } catch {
      showToast("Delete failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <div className="text-center py-16 text-muted-foreground">User not found.</div>;
  }

  const sessionCount = user.activeSessions ?? user.sessionsCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          User Detail
        </h1>
      </div>

      {/* Profile Card */}
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
            {(user.displayName?.[0] ?? user.email[0]).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                {user.displayName ?? user.email}
              </h2>
              <Badge status={user.status} />
              {(user.roles?.length ? user.roles : ["user"]).map((r) => (
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
            <p className="text-sm text-muted-foreground mt-0.5">
              {user.email}{" "}
              {user.emailVerifiedAt ? (
                <span
                  className="text-xs text-green-400"
                  title={`Verified ${fmt(user.emailVerifiedAt)}`}
                >
                  ✓ verified
                </span>
              ) : (
                <span className="text-xs text-yellow-400">unverified</span>
              )}
            </p>
          </div>
        </div>

        {/* Account metadata */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Created</dt>
            <dd className="mt-0.5 text-foreground">{fmt(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last login</dt>
            <dd className="mt-0.5 text-foreground">
              {user.lastLoginAt ? fmt(user.lastLoginAt) : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Updated</dt>
            <dd className="mt-0.5 text-foreground">{fmt(user.updatedAt)}</dd>
          </div>
          {user.username && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Username</dt>
              <dd className="mt-0.5 text-foreground">{user.username}</dd>
            </div>
          )}
          {user.phone && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Phone</dt>
              <dd className="mt-0.5 text-foreground">{user.phone}</dd>
            </div>
          )}
          {user.locale && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Locale</dt>
              <dd className="mt-0.5 text-foreground">{user.locale}</dd>
            </div>
          )}
          {user.oauthProviders && user.oauthProviders.length > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Linked logins
              </dt>
              <dd className="mt-0.5 text-foreground capitalize">
                {user.oauthProviders.join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* MFA Status */}
      <div className="rounded-xl bg-card border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Multi-Factor Authentication</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Authenticator App (TOTP)", enabled: user.mfa?.totpEnabled },
            {
              label: `Passkeys / WebAuthn${user.passkeyCount ? ` (${user.passkeyCount})` : ""}`,
              enabled: user.mfa?.webauthnEnabled,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-muted p-3 text-center">
              <div
                className={`text-lg mb-1 ${item.enabled ? "text-green-400" : "text-muted-foreground"}`}
              >
                {item.enabled ? "✓" : "✗"}
              </div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p
                className={`text-xs font-medium mt-0.5 ${item.enabled ? "text-green-400" : "text-muted-foreground"}`}
              >
                {item.enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Active Sessions</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessionCount} session{sessionCount !== 1 ? "s" : ""} active
            </p>
          </div>
          <button
            type="button"
            onClick={handleForceLogout}
            disabled={actionLoading || sessionCount === 0}
            className="rounded-lg bg-orange-900/40 border border-orange-500/30 px-4 py-2 text-sm text-orange-400 hover:bg-orange-900/60 disabled:opacity-40 transition-colors"
          >
            Force logout all
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl bg-card border border-red-900/40 p-6 space-y-4">
        <h3 className="font-semibold text-red-400">Danger Zone</h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={actionLoading}
            className="rounded-lg bg-orange-900/30 border border-orange-500/30 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-900/50 disabled:opacity-50 transition-colors"
          >
            {user.status === "active" ? "Suspend User" : "Activate User"}
          </button>
          <button
            type="button"
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
