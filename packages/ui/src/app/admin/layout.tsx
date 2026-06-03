"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthenticated, clearToken } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { brand } from "@/config/brand";

const navLinks = [
  { href: "/admin", icon: "📊", label: "Dashboard", exact: true },
  { href: "/admin/users", icon: "👥", label: "Users" },
  { href: "/admin/sessions", icon: "🔐", label: "Sessions" },
  { href: "/admin/settings/auth", icon: "🔑", label: "Auth Settings" },
  { href: "/admin/settings/general", icon: "⚙️", label: "General" },
  { href: "/admin/audit", icon: "📋", label: "Audit Logs" },
];

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  function handleSignOut() {
    clearToken();
    router.push("/login");
  }

  const sidebarContent = (
    <aside className="flex h-full w-60 flex-col bg-gray-900 border-r border-gray-800">
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <Link href="/admin" className="text-lg font-bold text-indigo-400 tracking-tight" onClick={onClose}>
          {brand.name} Admin
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navLinks.map((link) => {
          const active = isActive(link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white",
              ].join(" ")}
            >
              <span className="text-base leading-none">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-800 px-4 py-4 space-y-1">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="block w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          ← User Dashboard
        </Link>
        {/* ThemeToggle row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-sm text-gray-400 flex-1">Theme</span>
          <ThemeToggle />
        </div>
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: fixed sidebar, always visible */}
      <div className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col">
        {sidebarContent}
      </div>

      {/* Mobile: overlay sidebar */}
      {open && (
        <>
          {/* Dark backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60"
            aria-hidden="true"
            onClick={onClose}
          />
          {/* Sidebar panel */}
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-60 flex flex-col">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile top bar with hamburger */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <button
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {sidebarOpen ? (
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
        <span className="font-bold text-indigo-400">{brand.name} Admin</span>
      </div>

      {/* Main content: offset by sidebar width on desktop, full-width on mobile */}
      <main className="md:ml-60 min-h-screen p-8">{children}</main>
    </div>
  );
}
