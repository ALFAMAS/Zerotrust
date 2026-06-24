"use client";

import {
  ArrowLeft,
  Bell,
  Bot,
  ClipboardCheck,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Network,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell/AppShell";
import type { NavItem } from "@/components/app-shell/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { clearToken, isAuthenticated } from "@/lib/auth";

const navItems: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/revenue", icon: Wallet, label: "Revenue" },
  { href: "/admin/sessions", icon: Monitor, label: "Sessions" },
  { href: "/admin/settings/auth", icon: KeyRound, label: "Auth Settings" },
  { href: "/admin/did", icon: Fingerprint, label: "Decentralized ID" },
  { href: "/admin/jit", icon: ShieldQuestion, label: "JIT Requests" },
  { href: "/admin/workload", icon: Bot, label: "Workload Identity" },
  { href: "/admin/federation", icon: Network, label: "Federation" },
  { href: "/admin/approvals", icon: ShieldAlert, label: "Agent Approvals" },
  { href: "/admin/compliance", icon: ClipboardCheck, label: "Compliance" },
  { href: "/admin/alerts", icon: Bell, label: "Alerts" },
  { href: "/admin/settings/general", icon: Settings, label: "General" },
  { href: "/admin/access-reviews", icon: ShieldCheck, label: "Access Reviews" },
  { href: "/admin/audit", icon: ScrollText, label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // null = still checking, false = not an admin, true = authorized
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    let active = true;
    api
      .get<{ roles?: string[] }>("/auth/me")
      .then((me) => {
        if (!active) return;
        if (me?.roles?.includes("admin")) {
          setAuthorized(true);
        } else {
          // Authenticated but not an admin — keep them out of the admin area.
          setAuthorized(false);
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthorized(false);
        router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

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
