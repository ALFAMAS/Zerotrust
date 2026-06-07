"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  check: (user: any) => boolean;
}

const ITEMS: ChecklistItem[] = [
  {
    id: "email_verified",
    label: "Verify your email",
    href: "/dashboard/profile",
    check: (u) => u?.attributes?.emailVerified === true,
  },
  {
    id: "display_name",
    label: "Set your display name",
    href: "/dashboard/profile",
    check: (u) => !!u?.displayName && u.displayName !== u.email,
  },
  {
    id: "mfa_enabled",
    label: "Enable two-factor authentication",
    href: "/dashboard/security",
    check: (u) => u?.mfa?.totp?.enabled === true,
  },
  {
    id: "avatar",
    label: "Upload a profile photo",
    href: "/dashboard/profile",
    check: (u) => !!u?.avatarUrl,
  },
];

const DISMISS_KEY = "za_setup_checklist_dismissed";

export default function SetupChecklist({ user }: { user: any }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  if (!user || dismissed) return null;

  const completed = ITEMS.filter((i) => i.check(user));
  const total = ITEMS.length;
  if (completed.length === total) return null;

  const pct = Math.round((completed.length / total) * 100);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-white text-sm">Get started</h2>
        <button onClick={dismiss} className="text-gray-600 hover:text-gray-400 text-xs">
          Dismiss
        </button>
      </div>
      <p className="text-gray-500 text-xs mb-4">
        {completed.length}/{total} steps completed
      </p>

      <div className="h-1.5 bg-gray-800 rounded-full mb-5">
        <div
          className="h-1.5 bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {ITEMS.map((item) => {
          const done = item.check(user);
          return (
            <li key={item.id}>
              {done ? (
                <div className="flex items-center gap-3 text-sm text-gray-500 line-through">
                  <span className="text-green-500 w-4 flex-shrink-0">✓</span>
                  {item.label}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className="flex items-center gap-3 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  <span className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
