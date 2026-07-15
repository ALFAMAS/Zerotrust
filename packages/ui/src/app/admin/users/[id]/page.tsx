"use client";

import { useParams, useRouter } from "next/navigation";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DangerZone } from "@/components/ui/page-patterns";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
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
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userQuery = useAdminUserDetailQuery(id);
  const updateStatusMutation = useUpdateAdminUserStatusMutation(id);
  const segmentMutation = useSetAdminUserSegmentMutation(id);
  const forceLogoutMutation = useForceLogoutAdminUserMutation(id);
  const deleteMutation = useDeleteAdminUserMutation(id);

  const user = userQuery.data;
  const hasUser = user !== undefined;

  const actionPending =
    updateStatusMutation.isPending ||
    segmentMutation.isPending ||
    forceLogoutMutation.isPending ||
    deleteMutation.isPending;

  async function handleForceLogout() {
    if (!confirm("Force logout all sessions for this user?")) return;
    try {
      await forceLogoutMutation.mutateAsync();
      toast({ message: "All sessions revoked", type: "success" });
    } catch {
      toast({ message: "Action failed", type: "error" });
    }
  }

  async function handleToggleStatus() {
    if (!user) return;
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await updateStatusMutation.mutateAsync(newStatus);
      toast({ message: `User ${newStatus}`, type: "success" });
    } catch {
      toast({ message: "Action failed", type: "error" });
    }
  }

  async function handleDelete() {
    if (!user) return;
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync();
      toast({ message: "User deleted", type: "success" });
      setTimeout(() => router.push("/admin/users"), 800);
    } catch {
      toast({ message: "Delete failed", type: "error" });
    }
  }

  async function handleSegmentChange(segment: CustomerSegment) {
    if (!user) return;
    try {
      await segmentMutation.mutateAsync(segment);
      toast({ message: `Segment set to ${segment}`, type: "success" });
    } catch {
      toast({ message: "Failed to update segment", type: "error" });
    }
  }

  if (userQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Detail" />
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading…</div>
        </div>
      </div>
    );
  }

  if (userQuery.error && !hasUser) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Detail" />
        <ErrorState message={userQuery.error.message} retry={() => void userQuery.refetch()} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Detail" />
        <div className="py-8 text-center text-muted-foreground">User not found.</div>
      </div>
    );
  }

  const sessionCount = user.activeSessions ?? user.sessionsCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Button>
        <PageHeader title={<>User Detail</>} />
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
        <div className="flex items-center gap-6">
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
                  className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ${
                    r === "admin"
                      ? "bg-primary/15 text-primary ring-primary/30"
                      : "bg-muted text-muted-foreground ring-border"
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {user.email}{" "}
              {user.emailVerifiedAt ? (
                <span
                  className="text-xs text-success-subtle-foreground"
                  title={`Verified ${fmt(user.emailVerifiedAt)}`}
                >
                  ✓ verified
                </span>
              ) : (
                <span className="text-xs text-warning-subtle-foreground">unverified</span>
              )}
            </p>
          </div>
        </div>

        {/* Account metadata */}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Created</dt>
            <dd className="mt-1 text-foreground">{fmt(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last login</dt>
            <dd className="mt-1 text-foreground">
              {user.lastLoginAt ? fmt(user.lastLoginAt) : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Updated</dt>
            <dd className="mt-1 text-foreground">{fmt(user.updatedAt)}</dd>
          </div>
          {user.username && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Username</dt>
              <dd className="mt-1 text-foreground">{user.username}</dd>
            </div>
          )}
          {user.phone && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Phone</dt>
              <dd className="mt-1 text-foreground">{user.phone}</dd>
            </div>
          )}
          {user.locale && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Locale</dt>
              <dd className="mt-1 text-foreground">{user.locale}</dd>
            </div>
          )}
          {user.oauthProviders && user.oauthProviders.length > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Linked logins
              </dt>
              <dd className="mt-1 text-foreground capitalize">{user.oauthProviders.join(", ")}</dd>
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
                className={`text-lg mb-1 ${item.enabled ? "text-success-subtle-foreground" : "text-muted-foreground"}`}
              >
                {item.enabled ? "✓" : "✗"}
              </div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p
                className={`text-xs font-medium mt-1 ${item.enabled ? "text-success-subtle-foreground" : "text-muted-foreground"}`}
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
            <p className="text-sm text-muted-foreground mt-1">
              {sessionCount} session{sessionCount !== 1 ? "s" : ""} active
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleForceLogout}
            disabled={actionPending || sessionCount === 0}
            className="border-warning bg-warning/40 text-warning-subtle-foreground hover:bg-warning/60 disabled:opacity-40"
          >
            Force logout all
          </Button>
        </div>
      </div>

      {/* Customer Segment */}
      <div className="rounded-xl bg-card border border-border p-6">
        <h3 className="font-semibold text-foreground">Customer Segment</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
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
                className={`px-3 py-2 ${
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

      <DangerZone
        title="Danger zone"
        description="Suspend access temporarily or permanently delete this user."
      >
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleToggleStatus}
            disabled={actionPending}
            className="border-warning bg-warning/30 text-warning-subtle-foreground hover:bg-warning/50 disabled:opacity-50"
          >
            {user.status === "active" ? "Suspend User" : "Activate User"}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={actionPending}
            className="border-destructive bg-destructive/30 text-danger-subtle-foreground hover:bg-destructive/50 disabled:opacity-50"
          >
            Delete User
          </Button>
        </div>
      </DangerZone>
    </div>
  );
}
