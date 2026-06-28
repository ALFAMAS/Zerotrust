"use client";
import {
  Activity,
  Award,
  Bell,
  Building2,
  CreditCard,
  FileText as FileTextIcon,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  Plug,
  Search,
  Share2,
  ShieldCheck,
  ShieldQuestion,
  User,
  UserCog,
  Wallet,
  Webhook,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell/AppShell";
import type { NavItem } from "@/components/app-shell/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import FeedbackWidget from "@/components/FeedbackWidget";
import LiveChatWidget from "@/components/LiveChatWidget";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { NpsSurveyPrompt } from "@/components/NpsSurveyPrompt";
import ProductTour from "@/components/ProductTour";
import { ThemeToggle } from "@/components/ThemeToggle";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { clearToken, isAuthenticated } from "../../lib/auth";

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
  { href: "/dashboard/sessions", label: "Sessions", icon: Monitor },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/organizations", label: "Organizations", icon: Building2 },
  { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/points", label: "Points & Rewards", icon: Award },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/referrals", label: "Referrals", icon: Share2 },
  { href: "/dashboard/jit", label: "Cross-tenant", icon: ShieldQuestion },
  { href: "/dashboard/settings", label: "Connected Apps", icon: Plug },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
  { href: "/dashboard/account", label: "Account", icon: UserCog },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // null = still checking, true = authenticated. We never render the dashboard
  // shell (or let children fire authenticated API calls) until a token is present.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
  }, [router]);

  // Redirect this/other tabs when the token is cleared elsewhere
  // (sign-out, session revocation, or token expiry handled by the API client).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "za_access_token" && e.newValue === null) {
        router.replace("/login");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [router]);

  function handleSignOut() {
    clearToken();
    window.location.href = "/login";
  }

  // Until a token is confirmed, render a placeholder so the dashboard shell and
  // its data-fetching children never flash for a signed-out user.
  if (authed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </div>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      onSignOut={handleSignOut}
      banner={<VerifyEmailBanner />}
      actions={
        <>
          <LocaleSwitcher />
          <ThemeToggle />
          <NotificationBell />
        </>
      }
    >
      {children}
      <NpsSurveyPrompt />
      <FeedbackWidget type="nps" context="dashboard" delay={45_000} />
      <LiveChatWidget />
      <ProductTour />
      <CommandPalette />
    </AppShell>
  );
}
