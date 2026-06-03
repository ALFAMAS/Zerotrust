"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { SkeletonCard, SkeletonText } from "@/components/Skeleton";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<any>("/auth/me").then(setUser).catch(() => {}),
      api.get<any>("/sessions").then((d) => setSessions(d.sessions || d || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="mb-8 space-y-2">
          <SkeletonText className="h-7 w-64" />
          <SkeletonText className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.displayName || "…"}
        </h1>
        <p className="text-gray-400 mt-1">{user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Active Sessions", value: sessions.filter((s: any) => s.isActive).length, icon: "🔐" },
          { label: "MFA Status", value: user?.mfa?.totp?.enabled ? "Enabled" : "Off", icon: "🛡️" },
          { label: "Passkeys", value: user?.passkeys?.length ?? 0, icon: "🔑" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <div className="text-sm text-gray-400">{stat.label}</div>
              <div className="text-xl font-bold text-white">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/dashboard/security", label: "Set up MFA", desc: "Add a second factor" },
            { href: "/dashboard/security", label: "Add Passkey", desc: "Register a hardware key" },
            { href: "/dashboard/sessions", label: "View Sessions", desc: "Manage active devices" },
            { href: "/dashboard/profile", label: "Edit Profile", desc: "Update your details" },
          ].map((link) => (
            <a key={link.href + link.label} href={link.href}
              className="flex flex-col p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors">
              <span className="font-medium text-white text-sm">{link.label}</span>
              <span className="text-xs text-gray-400 mt-0.5">{link.desc}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
