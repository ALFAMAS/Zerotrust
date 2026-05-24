"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface User {
  email: string;
  displayName?: string;
  lastLoginAt?: string;
  mfaEnabled?: boolean;
  activeSessions?: number;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const quickActions = [
  {
    title: "Edit Profile",
    desc: "Update your name and personal details",
    icon: "👤",
    href: "/dashboard/profile",
  },
  {
    title: "Security Settings",
    desc: "Manage MFA, passkeys and password",
    icon: "🔒",
    href: "/dashboard/security",
  },
  {
    title: "Connected Apps",
    desc: "Manage OAuth providers",
    icon: "🔗",
    href: "/dashboard/settings",
  },
  {
    title: "View Sessions",
    desc: "See and manage active devices",
    icon: "💻",
    href: "/dashboard/sessions",
  },
];

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const name = user?.displayName || user?.email || "there";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          {greeting()}, {name.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Here&apos;s an overview of your account.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Last login
          </p>
          <p className="text-white font-semibold text-sm">
            {user?.lastLoginAt
              ? new Date(user.lastLoginAt).toLocaleString()
              : "Just now"}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Active sessions
          </p>
          <p className="text-white font-semibold text-2xl">
            {user?.activeSessions ?? 1}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            MFA status
          </p>
          {user?.mfaEnabled ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400" /> Enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Not enabled
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-colors group"
            >
              <div className="text-3xl mb-3">{action.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-1 group-hover:text-indigo-300 transition-colors">
                {action.title}
              </h3>
              <p className="text-gray-500 text-xs">{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
