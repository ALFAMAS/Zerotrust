"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Badge from "@/components/Badge";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/States";
import {
  CUSTOMER_SEGMENTS,
  useAdminUserDetailQuery,
  useDeleteAdminUserMutation,
  useForceLogoutAdminUserMutation,
  useSetAdminUserSegmentMutation,
  useUpdateAdminUserStatusMutation,
} from "@/lib/server-state/adminUsers";
import type { CustomerSegment } from "@/lib/server-state/types";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userQuery = useAdminUserDetailQuery(id);
  const updateStatusMutation = useUpdateAdminUserStatusMutation(id);
  const segmentMutation = useSetAdminUserSegmentMutation(id);
  const forceLogoutMutation = useForceLogoutAdminUserMutation(id);
  const deleteMutation = useDeleteAdminUserMutation(id);
  const [toast, setToast] = useState<string | null>(null);

  const user = userQuery.data;
  const hasUser = user !== undefined;

  const actionPending =
    updateStatusMutation.isPending ||
    segmentMutation.isPending ||
    forceLogoutMutation.isPending ||
    deleteMutation.isPending;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleForceLogout() {
    if (!confirm("Force logout all sessions for this user?")) return;
    try {
      await forceLogoutMutation.mutateAsync();
      showToast("All sessions revoked");
    } catch {
      showToast("Action failed");
    }
  }

  async function handleToggleStatus() {
    if (!user) return;
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await updateStatusMutation.mutateAsync(newStatus);
      showToast(`User ${newStatus}`);
    } catch {
      showToast("Action failed");
    }
  }

  async function handleDelete() {
    if (!user) return;
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync();
      showToast("User deleted");
      setTimeout(() => router.push("/admin/users"), 800);
    } catch {
      showToast("Delete failed");
    }
  }

  async function handleSegmentChange(segment: CustomerSegment) {
    if (!user) return;
    try {
      await segmentMutation.mutateAsync(segment);
      showToast(`Segment set to ${segment}`);
    } catch {
      showToast("Failed to update segment");
    }
  }

  if (userQuery.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (userQuery.error && !hasUser) {
    return (
      <ErrorState message={userQuery.error.message} retry={() => void userQuery.refetch()} />
    );
  }

  if (!user) {
    return <div className="text-center py-16 text-muted-foreground">User not found.</div>;
  }

  const sessionCount = user.activeSessions ?? user.sessionsCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          User Detail
        </h1>
      </div>

      <ServerStateStatus
        isFetching={userQuery.isFetching}
        isStale={userQuery.isStale}
        hasData={hasUser}
        label="user"
        onRefresh={() => void userQuery.refetch()}
      />

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
          <Button
            variant="outline"
            onClick={handleForceLogout}
            disabled={actionPending || sessionCount === 0}
            className="border-orange-500/30 bg-orange-900/40 text-orange-400 hover:bg-orange-900/60 disabled:opacity-40"
          >
            Force logout all
          </Button>
        </div>
      </div>

      {/* Customer Segment */}
      <div className="rounded-xl bg-card border border-border p-6">
        <h3 className="font-semibold text-foreground">Customer Segment</h3>
        <p className="text-sm text-muted-foreground mt-0.5 mb-3">
          Tag this account for CS/success workflows.
        </p>
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_SEGMENTS.map((seg) => {
            const active = user.customerSegment === seg;
            return (
              <Button
                key={seg}
                variant="outline"
                onClick={() => handleSegmentChange(seg)}
                disabled={actionPending}
                className={`px-3 py-1.5 ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {seg.replace("_", " ")}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl bg-card border border-red-900/40 p-6 space-y-4">
        <h3 className="font-semibold text-red-400">Danger Zone</h3>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleToggleStatus}
            disabled={actionPending}
            className="border-orange-500/30 bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 disabled:opacity-50"
          >
            {user.status === "active" ? "Suspend User" : "Activate User"}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={actionPending}
            className="border-red-500/30 bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50"
          >
            Delete User
          </Button>
        </div>
      </div>
    </div>
  );
}
