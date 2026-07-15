"use client";
import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  Search,
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
import { UserProfileMenu } from "@/components/UserProfileMenu";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { bootstrapAccessToken, clearToken, isAuthenticated } from "../../lib/auth";

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    group: "Workspace",
  },
  { href: "/dashboard/search", label: "Search", icon: Search, group: "Workspace" },
  { href: "/dashboard/profile", label: "Profile", icon: User, group: "Workspace" },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck, group: "Protection" },
  { href: "/dashboard/sessions", label: "Sessions", icon: Monitor, group: "Protection" },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: Bell,
    group: "Protection",
  },
  {
    href: "/dashboard/organizations",
    label: "Organizations",
    icon: Building2,
    group: "Teams",
  },
  { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound, group: "Developer" },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook, group: "Developer" },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, group: "Commerce" },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet, group: "Commerce" },
  {
    href: "/dashboard/jit",
    label: "Cross-tenant",
    icon: ShieldQuestion,
    group: "Access",
  },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy, group: "Account" },
  { href: "/dashboard/account", label: "Account", icon: UserCog, group: "Account" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // null = still checking, true = authenticated. We never render the dashboard
  // shell (or let children fire authenticated API calls) until a token is present.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      if (isAuthenticated()) {
        if (!cancelled) setAuthed(true);
        return;
      }

      const token = await bootstrapAccessToken();
      if (cancelled) return;

      if (token) {
        setAuthed(true);
        return;
      }

      router.replace("/login");
    }

    void verifySession();
    return () => {
      cancelled = true;
    };
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
    void clearToken();
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
      banner={<VerifyEmailBanner />}
      profileMenu={<UserProfileMenu onSignOut={handleSignOut} />}
      actions={
        <>
          <LocaleSwitcher />
          <span className="hidden min-[1024px]:inline-flex">
            <ThemeToggle />
          </span>
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
