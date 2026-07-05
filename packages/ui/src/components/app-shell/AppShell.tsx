"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AppFooter from "./AppFooter";
import AppSidebar, { type NavItem } from "./AppSidebar";
import AppTopbar from "./AppTopbar";

interface AppShellProps {
  navItems: NavItem[];
  /** e.g. "Admin" — appended after the brand name in the sidebar/topbar. */
  brandSuffix?: string;
  /** Right-aligned topbar actions (locale switcher, theme toggle, notifications…). */
  actions?: React.ReactNode;
  /** Extra links rendered at the bottom of the sidebar. */
  sidebarFooter?: React.ReactNode;
  /** Banner rendered directly under the topbar (e.g. verify-email prompt). */
  banner?: React.ReactNode;
  /** Profile avatar menu (balance, admin link, sign out). */
  profileMenu?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared responsive shell for authenticated areas (dashboard + admin):
 * fixed sidebar on desktop, slide-over drawer on mobile, a sticky topbar with
 * an action cluster, and a compact footer. Keeps every authenticated page on
 * one consistent, responsive layout.
 */
export default function AppShell({
  navItems,
  brandSuffix,
  actions,
  sidebarFooter,
  banner,
  profileMenu,
  children,
}: AppShellProps) {
  const _pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, []);

  // Esc closes the drawer; lock body scroll while it's open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar
        items={navItems}
        open={open}
        onClose={() => setOpen(false)}
        brandSuffix={brandSuffix}
        footer={sidebarFooter}
      />

      <div className="flex min-h-screen flex-col md:ml-64">
        <AppTopbar
          brandSuffix={brandSuffix}
          onMenuClick={() => setOpen(true)}
          actions={actions}
          profileMenu={profileMenu}
        />
        {banner}
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
