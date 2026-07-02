"use client";
import { KeyRound, Monitor, ShieldCheck, User, Wallet } from "lucide-react";
import Link from "next/link";
import { ProgressBars } from "@/components/ProgressBars";
import SetupChecklist from "@/components/SetupChecklist";
import { SkeletonCard, SkeletonText } from "@/components/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useAuthMeQuery } from "@/lib/server-state/auth";
import { useUserSessionsListQuery } from "@/lib/server-state/sessions";

export default function DashboardPage() {
  const userQuery = useAuthMeQuery();
  const sessionsQuery = useUserSessionsListQuery();

  const user = userQuery.data;
  const sessions = sessionsQuery.data ?? [];
  const loading = userQuery.isLoading || sessionsQuery.isLoading;

  if (userQuery.error && !user) {
    return (
      <ErrorState
        message={userQuery.error.message || "Failed to load dashboard"}
        retry={() => void userQuery.refetch()}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <div className="mb-8 space-y-2">
          <SkeletonText className="h-7 w-64" />
          <SkeletonText className="h-4 w-48" />
        </div>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  const stats = [
    {
      label: "Active sessions",
      value: sessions.filter((s) => s.isActive).length,
      icon: Monitor,
    },
    { label: "MFA", value: user?.mfa?.totp?.enabled ? "Enabled" : "Off", icon: ShieldCheck },
    { label: "Passkeys", value: user?.passkeys?.length ?? 0, icon: KeyRound },
  ];

  const quickLinks = [
    {
      href: "/dashboard/security",
      label: "Set up MFA",
      desc: "Add a second factor",
      icon: ShieldCheck,
    },
    {
      href: "/dashboard/security",
      label: "Add passkey",
      desc: "Register a hardware key",
      icon: KeyRound,
    },
    {
      href: "/dashboard/sessions",
      label: "View sessions",
      desc: "Manage active devices",
      icon: Monitor,
    },
    { href: "/dashboard/profile", label: "Edit profile", desc: "Update your details", icon: User },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Welcome back, {user?.displayName || "…"}
        </h1>
        <p className="mt-1 text-muted-foreground">{user?.email}</p>
      </div>

      <SetupChecklist user={user} />

      <ProgressBars user={user} />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-primary">
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="font-display text-xl font-semibold text-foreground">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-medium text-foreground">Quick links</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/50"
            >
              <link.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <span className="block text-sm font-medium text-foreground">{link.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{link.desc}</span>
              </div>
            </Link>
          ))}
          <Link
            href="/dashboard/wallet"
            className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/50"
          >
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <span className="block text-sm font-medium text-foreground">Wallet</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Manage your balance and transactions
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
