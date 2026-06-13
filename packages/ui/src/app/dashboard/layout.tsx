"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { clearToken } from "../../lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { brand } from "@/config/brand";
import FeedbackWidget from "@/components/FeedbackWidget";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/security", label: "Security" },
  { href: "/dashboard/sessions", label: "Sessions" },
  { href: "/dashboard/organizations", label: "Organizations" },
  { href: "/dashboard/api-keys", label: "API Keys" },
  { href: "/dashboard/webhooks", label: "Webhooks" },
  { href: "/dashboard/billing", label: "Billing" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function handleSignOut() {
    clearToken();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-background">
      <nav
        className="border-b border-border px-6 py-4"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          {/* Left: logo + desktop nav links */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: brand.logoColor }}
              >
                {brand.logoLetter}
              </div>
              <span className="font-bold text-foreground">{brand.name}</span>
            </div>
            {/* Desktop nav links */}
            <div className="hidden gap-1 md:flex" role="menubar">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: LocaleSwitcher + ThemeToggle + NotificationBell + sign out + hamburger */}
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <NotificationBell />
            <button
              onClick={handleSignOut}
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              Sign Out
            </button>
            {/* Hamburger — mobile only */}
            <button
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileOpen && (
          <div
            id="mobile-nav-menu"
            role="menu"
            aria-label="Mobile navigation"
            className="mx-auto mt-4 flex max-w-5xl flex-col gap-1 border-t border-border pb-2 pt-4 md:hidden"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
            <button
              role="menuitem"
              onClick={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
              className="mt-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Sign Out
            </button>
          </div>
        )}
      </nav>

      <VerifyEmailBanner />

      <main id="main-content" className="mx-auto max-w-5xl px-6 py-8">
        {children}
      </main>

      <FeedbackWidget type="nps" context="dashboard" delay={45_000} />
    </div>
  );
}
