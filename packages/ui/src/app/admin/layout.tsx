"use client";

import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
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
import { useEffect } from "react";
import AppShell from "@/components/app-shell/AppShell";
import type { NavItem } from "@/components/app-shell/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { useAuthMeQuery } from "@/lib/server-state/auth";

const navItems: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/roles", icon: KeyRound, label: "Roles" },
  { href: "/admin/revenue", icon: Wallet, label: "Revenue" },
  { href: "/admin/sessions", icon: Monitor, label: "Sessions" },
  { href: "/admin/feedback", icon: MessageSquare, label: "Feedback" },
  { href: "/admin/anomaly", icon: Activity, label: "Anomaly Detection" },
  { href: "/admin/settings/auth", icon: KeyRound, label: "Auth Settings" },
  { href: "/admin/jit", icon: ShieldQuestion, label: "JIT Requests" },
  { href: "/admin/jit-grants", icon: Shield, label: "JIT Grants" },
  { href: "/admin/tenants", icon: Building2, label: "Tenants" },
  { href: "/admin/regions", icon: Globe2, label: "Data Residency" },
  { href: "/admin/search", icon: Search, label: "Search Index" },
  { href: "/admin/content", icon: FileText, label: "Content" },
  { href: "/admin/webhooks", icon: Webhook, label: "Webhook Log" },
  { href: "/admin/compliance", icon: ClipboardCheck, label: "Compliance" },
  { href: "/admin/alerts", icon: Bell, label: "Alerts" },
  { href: "/admin/settings/general", icon: Settings, label: "General" },
  { href: "/admin/access-reviews", icon: ShieldCheck, label: "Access Reviews" },
  { href: "/admin/audit", icon: ScrollText, label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authed = isAuthenticated();
  const { data: me, isPending, isError } = useAuthMeQuery(authed);

  useEffect(() => {
    if (!authed) {
      router.replace("/login");
      return;
    }
    if (isPending) return;
    if (isError || !me) {
      router.replace("/login");
      return;
    }
    if (!me.roles?.includes("admin")) {
      router.replace("/dashboard");
    }
  }, [authed, router, me, isPending, isError]);

  // null = still checking, false = not an admin, true = authorized
  let authorized: boolean | null = null;
  if (!authed) authorized = false;
  else if (isPending) authorized = null;
  else if (isError || !me) authorized = false;
  else if (!me.roles?.includes("admin")) authorized = false;
  else authorized = true;

  function handleSignOut() {
    clearToken();
    router.push("/login");
  }

  // Until the admin role is confirmed, don't render the admin shell or its
  // children (which would otherwise fire admin API calls and 403).
  if (authorized !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          {authorized === false ? "Access denied. Redirecting…" : "Checking access…"}
        </p>
      </div>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      brandSuffix="Admin"
      onSignOut={handleSignOut}
      actions={<ThemeToggle />}
      sidebarFooter={
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          User dashboard
        </Link>
      }
    >
      {children}
    </AppShell>
  );
}
