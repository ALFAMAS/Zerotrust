"use client";

import { Download, KeyRound, LogIn, Monitor, UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import MetricCard from "@/components/admin/MetricCard";
import RadialGauge from "@/components/admin/RadialGauge";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import {
  useAdminRecentUsersQuery,
  useAdminStatsQuery,
  useExportUsersMutation,
} from "@/lib/server-state/adminDashboard";

const quickActions = [
  { href: "/admin/users", icon: UserPlus, title: "Add user", desc: "Invite a new member" },
  { href: "/admin/sessions", icon: Monitor, title: "View sessions", desc: "Active user sessions" },
  {
    href: "/admin/settings/auth",
    icon: KeyRound,
    title: "Auth settings",
    desc: "Configure auth methods",
  },
];

export default function AdminOverviewClient() {
  const statsQuery = useAdminStatsQuery();
  const usersQuery = useAdminRecentUsersQuery(5);
  const exportMutation = useExportUsersMutation();

  const loading = statsQuery.isPending || usersQuery.isPending;
  const stats = statsQuery.data;
  const recentUsers = usersQuery.data ?? [];

  async function exportUsers() {
    try {
      const blob = await exportMutation.mutateAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  }

  const activePct =
    stats && stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  if ((statsQuery.error && !statsQuery.data) || (usersQuery.error && !usersQuery.data)) {
    return (
      <ErrorState
        message={
          statsQuery.error?.message || usersQuery.error?.message || "Failed to load admin dashboard"
        }
        retry={() => {
          void statsQuery.refetch();
          void usersQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="Overview of your authentication platform" />

      <ServerStateStatus
        isFetching={statsQuery.isFetching || usersQuery.isFetching}
        isStale={statsQuery.isStale || usersQuery.isStale}
        hasData={Boolean(statsQuery.data || usersQuery.data)}
      />

      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Total users" value={stats?.totalUsers ?? "—"} />
          <MetricCard
            icon={UserCheck}
            label="Active users (30d)"
            value={stats?.activeUsers ?? "—"}
          />
          <MetricCard icon={Monitor} label="Active sessions" value={stats?.activeSessions ?? "—"} />
          <MetricCard icon={LogIn} label="Logins (24h)" value={stats?.totalLogins24h ?? "—"} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="font-medium text-foreground">User activity</h2>
          <p className="text-xs text-muted-foreground">Active in the last 30 days</p>
          <div className="mt-4">
            <RadialGauge
              value={activePct}
              label="Active"
              caption={stats ? `${stats.activeUsers} of ${stats.totalUsers} users` : undefined}
            />
          </div>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-medium text-foreground">Recent users</h2>
            <Link href="/admin/users" className="text-xs text-primary hover:text-primary/80">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentUsers.length === 0 && !loading && (
              <p className="px-6 py-6 text-sm text-muted-foreground">No users found.</p>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary">
                  {(u.name?.[0] ?? u.email[0]).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.name ?? u.email}
                  </p>
                  {u.name && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                </div>
                <Badge status={u.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-6 lg:grid-cols-4">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/50"
            >
              <a.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{a.title}</span>
              <span className="text-xs text-muted-foreground">{a.desc}</span>
            </Link>
          ))}
          <Button
            onClick={exportUsers}
            disabled={exportMutation.isPending}
            className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
          >
            <Download className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Export users</span>
            <span className="text-xs text-muted-foreground">
              {exportMutation.isPending ? "Preparing…" : "Download CSV"}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
