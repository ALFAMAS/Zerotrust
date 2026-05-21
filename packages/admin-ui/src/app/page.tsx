"use client";
import { useEffect, useState } from "react";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalUsers: "—",
    activeSessions: "—",
    successRate: "—",
    anomalyEvents: "—",
  });

  useEffect(() => {
    // In a real deployment these would be separate admin API endpoints
    Promise.allSettled([
      api.get<{ total: number }>("/admin/users?limit=1"),
      api.get<{ total: number }>("/admin/sessions?status=active&limit=1"),
    ])
      .then(([users, sessions]) => {
        setStats((s) => ({
          ...s,
          totalUsers: users.status === "fulfilled" ? String((users.value as any).total ?? "—") : "—",
          activeSessions: sessions.status === "fulfilled" ? String((sessions.value as any).total ?? "—") : "—",
        }));
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">ZeroAuth system overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers} icon="👤" color="indigo" />
        <StatCard title="Active Sessions" value={stats.activeSessions} icon="🔐" color="green" />
        <StatCard title="Auth Success Rate" value={stats.successRate} icon="✅" color="green" />
        <StatCard title="Anomaly Events (24h)" value={stats.anomalyEvents} icon="⚠️" color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: "View pending JIT requests", href: "/jit" },
              { label: "Review recent audit logs", href: "/audit" },
              { label: "Manage user roles", href: "/roles" },
              { label: "Check active sessions", href: "/sessions" },
            ].map((action) => (
              <a
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white"
              >
                <span className="text-indigo-400">→</span>
                {action.label}
              </a>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="font-semibold text-white mb-4">System Status</h2>
          <div className="space-y-3">
            {[
              { label: "API Server", status: "operational" },
              { label: "MongoDB", status: "operational" },
              { label: "Redis", status: "operational" },
              { label: "Elasticsearch", status: "operational" },
            ].map((svc) => (
              <div key={svc.label} className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{svc.label}</span>
                <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {svc.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
