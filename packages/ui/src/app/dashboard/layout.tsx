"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearToken } from "../../lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { brand } from "@/config/brand";
import FeedbackWidget from "@/components/FeedbackWidget";
import LocaleSwitcher from "@/components/LocaleSwitcher";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/security", label: "Security" },
  { href: "/dashboard/sessions", label: "Sessions" },
  { href: "/dashboard/organizations", label: "Organizations" },
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
    <div className="min-h-screen bg-gray-950">
      <nav
        className="border-b border-gray-800 px-6 py-4"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Left: logo + desktop nav links */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                style={{ backgroundColor: brand.logoColor }}
              >
                {brand.logoLetter}
              </div>
              <span className="font-bold text-white">{brand.name}</span>
            </div>
            {/* Desktop nav links */}
            <div className="hidden md:flex gap-1" role="menubar">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    pathname === item.href
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
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
              className="hidden md:block text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
            {/* Hamburger — mobile only */}
            <button
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              {mobileOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="w-5 h-5"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <>
                  <span className="block w-5 h-0.5 bg-current rounded" />
                  <span className="block w-5 h-0.5 bg-current rounded" />
                  <span className="block w-5 h-0.5 bg-current rounded" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileOpen && (
          <div
            id="mobile-nav-menu"
            role="menu"
            aria-label="Mobile navigation"
            className="md:hidden mt-4 pb-2 border-t border-gray-800 pt-4 flex flex-col gap-1 max-w-5xl mx-auto"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
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
              className="mt-2 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-left"
            >
              Sign Out
            </button>
          </div>
        )}
      </nav>

      <main id="main-content" className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>

      <FeedbackWidget type="nps" context="dashboard" delay={45_000} />
    </div>
  );
}
