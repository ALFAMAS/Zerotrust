"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";

interface Stats {
  totalUsers: number;
  activeSessions: number;
  loginsLast24h: number;
  authMethodsEnabled: number;
}

interface User {
  id: string;
  name?: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

export default function DashboardPage() {
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
          setRecentUsers(Array.isArray(v) ? v : v.users ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of your authentication platform</p>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={stats?.totalUsers ?? "—"}
            icon="👤"
            color="blue"
          />
          <StatCard
            title="Active Sessions"
            value={stats?.activeSessions ?? "—"}
            icon="🟢"
            color="green"
          />
          <StatCard
            title="Logins (last 24h)"
            value={stats?.loginsLast24h ?? "—"}
            icon="🔓"
            color="indigo"
          />
          <StatCard
            title="Auth Methods Enabled"
            value={stats?.authMethodsEnabled ?? "—"}
            icon="🛡️"
            color="purple"
          />
        </div>
      )}

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent Users</h2>
            <Link href="/admin/users" className="text-xs text-primary hover:text-primary/80">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {recentUsers.length === 0 && !loading && (
              <p className="px-5 py-6 text-sm text-muted-foreground">No users found.</p>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-900/60 text-sm font-medium text-primary">
                  {(u.name?.[0] ?? u.email[0]).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.name ?? u.email}
                  </p>
                  {u.name && (
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  )}
                </div>
                <Badge status={u.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Quick Actions</h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            <Link
              href="/admin/users"
              className="flex flex-col items-start gap-2 rounded-lg bg-muted hover:bg-gray-750 border border-border p-4 transition-colors hover:border-primary/50"
            >
              <span className="text-xl">➕</span>
              <span className="text-sm font-medium text-foreground">Add User</span>
              <span className="text-xs text-muted-foreground">Invite a new member</span>
            </Link>
            <Link
              href="/admin/sessions"
              className="flex flex-col items-start gap-2 rounded-lg bg-muted border border-border p-4 transition-colors hover:border-primary/50"
            >
              <span className="text-xl">🔐</span>
              <span className="text-sm font-medium text-foreground">View Sessions</span>
              <span className="text-xs text-muted-foreground">Active user sessions</span>
            </Link>
            <Link
              href="/admin/settings/auth"
              className="flex flex-col items-start gap-2 rounded-lg bg-muted border border-border p-4 transition-colors hover:border-primary/50"
            >
              <span className="text-xl">🔑</span>
              <span className="text-sm font-medium text-foreground">Auth Settings</span>
              <span className="text-xs text-muted-foreground">Configure auth methods</span>
            </Link>
            <button
              onClick={() => alert("Export triggered")}
              className="flex flex-col items-start gap-2 rounded-lg bg-muted border border-border p-4 transition-colors hover:border-primary/50 text-left"
            >
              <span className="text-xl">📤</span>
              <span className="text-sm font-medium text-foreground">Export Users</span>
              <span className="text-xs text-muted-foreground">Download CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
