"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthenticated, clearTokens } from "@/lib/auth";

const navLinks = [
  { href: "/admin", icon: "📊", label: "Dashboard", exact: true },
  { href: "/admin/users", icon: "👥", label: "Users" },
  { href: "/admin/sessions", icon: "🔐", label: "Sessions" },
  { href: "/admin/settings/auth", icon: "🔑", label: "Auth Settings" },
  { href: "/admin/settings/general", icon: "⚙️", label: "General" },
  { href: "/admin/audit", icon: "📋", label: "Audit Logs" },
];

function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  function handleSignOut() {
    clearTokens();
    router.push("/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-gray-900 border-r border-gray-800">
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <Link href="/admin" className="text-lg font-bold text-indigo-400 tracking-tight">
          Admin Panel
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navLinks.map((link) => {
          const active = isActive(link.href, link.exact);
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
      <div className="border-t border-gray-800 px-4 py-4">
        <Link
          href="/dashboard"
          className="block w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors mb-1"
        >
          ← User Dashboard
        </Link>
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminSidebar />
      <main className="ml-60 min-h-screen p-8">{children}</main>
    </div>
  );
}
