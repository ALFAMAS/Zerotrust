"use client";

import {
  Activity,
  ArrowLeft,
  Bell,
  ClipboardCheck,
  FileText,
  Globe2,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShieldQuestion,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell/AppShell";
import type { NavItem } from "@/components/app-shell/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { bootstrapAccessToken, clearToken, isAuthenticated } from "@/lib/auth";
import { useAuthMeQuery } from "@/lib/server-state/auth";

const navItems: NavItem[] = [
  {
    href: "/admin",
    icon: LayoutDashboard,
    label: "Dashboard",
    exact: true,
    group: "Overview",
  },
  { href: "/admin/users", icon: Users, label: "Users", group: "Identity" },
  { href: "/admin/roles", icon: KeyRound, label: "Roles", group: "Identity" },
  { href: "/admin/sessions", icon: Monitor, label: "Sessions", group: "Identity" },
  { href: "/admin/jit", icon: ShieldQuestion, label: "JIT Requests", group: "Identity" },
  { href: "/admin/jit-grants", icon: Shield, label: "JIT Grants", group: "Identity" },
  { href: "/admin/analytics", icon: Activity, label: "Analytics", group: "Monitoring" },
  {
    href: "/admin/anomaly",
    icon: Activity,
    label: "Anomaly Detection",
    group: "Monitoring",
  },
  { href: "/admin/alerts", icon: Bell, label: "Alerts", group: "Monitoring" },
  { href: "/admin/audit", icon: ScrollText, label: "Audit Logs", group: "Monitoring" },
  { href: "/admin/webhooks", icon: Webhook, label: "Webhook Log", group: "Monitoring" },
  { href: "/admin/feedback", icon: MessageSquare, label: "Feedback", group: "Monitoring" },
  {
    href: "/admin/compliance",
    icon: ClipboardCheck,
    label: "Compliance",
    group: "Governance",
  },
  {
    href: "/admin/access-reviews",
    icon: ShieldCheck,
    label: "Access Reviews",
    group: "Governance",
  },
  { href: "/admin/revenue", icon: Wallet, label: "Revenue", group: "Platform" },
  { href: "/admin/settings/auth", icon: KeyRound, label: "Auth Settings", group: "Platform" },
  {
    href: "/admin/regions",
    icon: Globe2,
    label: "Branding & Domains",
    group: "Platform",
  },
  { href: "/admin/search", icon: Search, label: "Search Index", group: "Platform" },
  { href: "/admin/content", icon: FileText, label: "Content", group: "Platform" },
  { href: "/admin/settings/general", icon: Settings, label: "General", group: "Platform" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const tokenPresent = sessionReady && isAuthenticated();
  const { data: me, isPending, isError } = useAuthMeQuery(tokenPresent);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (isAuthenticated()) {
        if (!cancelled) setSessionReady(true);
        return;
      }

      await bootstrapAccessToken();
      if (!cancelled) setSessionReady(true);
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !sessionReady) return;

    if (!isAuthenticated()) {
      setAuthorized(false);
      router.replace("/login");
      return;
    }

    if (isPending) return;

    if (isError || !me) {
      setAuthorized(false);
      router.replace("/login");
      return;
    }

    if (!me.roles?.includes("admin")) {
      setAuthorized(false);
      router.replace("/dashboard");
      return;
    }

    setAuthorized(true);
  }, [ready, sessionReady, isPending, isError, me, router]);

  function handleSignOut() {
    void clearToken();
    router.push("/login");
  }

  // Until mounted and auth is resolved, show the same placeholder on server and client.
  if (!ready || authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (authorized !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Access denied. Redirecting…</p>
      </div>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      brandSuffix="Admin"
      profileMenu={<UserProfileMenu onSignOut={handleSignOut} showDashboardLink />}
      actions={<ThemeToggle />}
      sidebarFooter={
        <Link
          href="/dashboard"
          title="User dashboard"
          aria-label="User dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sidebar-footer-label truncate">User dashboard</span>
        </Link>
      }
    >
      {children}
      <CommandPalette />
    </AppShell>
  );
}
