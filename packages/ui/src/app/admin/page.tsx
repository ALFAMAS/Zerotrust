"use client";

import { Download, KeyRound, LogIn, Monitor, UserCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import MetricCard from "@/components/admin/MetricCard";
import RadialGauge from "@/components/admin/RadialGauge";
import Badge from "@/components/Badge";
import { brand } from "@/config/brand";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  totalLogins24h: number;
}

interface User {
  id: string;
  name?: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

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

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, usersData] = await Promise.allSettled([
          api.get<Stats>("/admin/stats"),
          api.get<{ users: User[] } | User[]>("/admin/users?limit=5"),
        ]);

        if (statsData.status === "fulfilled") setStats(statsData.value);
        if (usersData.status === "fulfilled") {
          const v = usersData.value;
          setRecentUsers(Array.isArray(v) ? v : (v.users ?? []));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const [exporting, setExporting] = useState(false);

  async function exportUsers() {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`${brand.apiUrl}/admin/users/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
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
    } finally {
      setExporting(false);
    }
  }

  const activePct =
    stats && stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your authentication platform
        </p>
      </div>

      {/* Metric tiles */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
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
        {/* Activity gauge (real active/total ratio) */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium text-foreground">User activity</h2>
          <p className="text-xs text-muted-foreground">Active in the last 30 days</p>
          <div className="mt-4">
            <RadialGauge
              value={activePct}
              label="Active"
              caption={stats ? `${stats.activeUsers} of ${stats.totalUsers} users` : undefined}
            />
          </div>
        </div>

        {/* Recent users */}
        <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-medium text-foreground">Recent users</h2>
            <Link href="/admin/users" className="text-xs text-primary hover:text-primary/80">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentUsers.length === 0 && !loading && (
              <p className="px-5 py-6 text-sm text-muted-foreground">No users found.</p>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
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
        </div>
      </div>

      {/* Quick actions */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-medium text-foreground">Quick actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
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
          <button
            onClick={exportUsers}
            disabled={exporting}
            className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
          >
            <Download className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Export users</span>
            <span className="text-xs text-muted-foreground">
              {exporting ? "Preparing…" : "Download CSV"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
