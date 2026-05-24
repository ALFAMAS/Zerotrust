"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", icon: "📊", label: "Dashboard" },
  { href: "/users", icon: "👥", label: "Users" },
  { href: "/sessions", icon: "🔐", label: "Sessions" },
  { href: "/settings/auth", icon: "🔑", label: "Auth Settings" },
  { href: "/settings/general", icon: "⚙️", label: "General Settings" },
  { href: "/audit", icon: "📋", label: "Audit Logs" },
];

interface SidebarProps {
  adminEmail?: string;
}

export default function Sidebar({ adminEmail }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function handleSignOut() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("za_admin_token");
      window.location.href = "/login";
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-gray-900 border-r border-gray-800">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <span className="text-lg font-bold text-indigo-400 tracking-tight">Acme Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
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

      {/* Bottom: user info + sign out */}
      <div className="border-t border-gray-800 px-4 py-4 space-y-2">
        {adminEmail && (
          <p className="truncate text-xs text-gray-500">{adminEmail}</p>
        )}
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
