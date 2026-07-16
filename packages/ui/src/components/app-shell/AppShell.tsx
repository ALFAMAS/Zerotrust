"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import AppFooter from "./AppFooter";
import AppSidebar, { type NavItem } from "./AppSidebar";
import AppTopbar from "./AppTopbar";

const SIDEBAR_COLLAPSED_KEY = "za_sidebar_collapsed";

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
  "use memo";

  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // localStorage unavailable (private mode)
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const closeMobileNavigation = useCallback(() => {
    setOpen(false);
    setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar
        items={navItems}
        open={open}
        onClose={closeMobileNavigation}
        brandSuffix={brandSuffix}
        footer={sidebarFooter}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[margin] duration-200 ease-out min-[1024px]:ml-16",
          !sidebarCollapsed && "min-[1024px]:ml-64"
        )}
      >
        <AppTopbar
          brandSuffix={brandSuffix}
          onMenuClick={() => setOpen(true)}
          menuButtonRef={menuButtonRef}
          actions={actions}
          profileMenu={profileMenu}
        />
        {banner}
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
