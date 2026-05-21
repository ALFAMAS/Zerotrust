"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearToken } from "../../lib/auth";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/security", label: "Security" },
  { href: "/dashboard/sessions", label: "Sessions" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">Z</div>
              <span className="font-bold text-white">ZeroAuth</span>
            </div>
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${pathname === item.href ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <button
            onClick={() => { clearToken(); window.location.href = "/login"; }}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
