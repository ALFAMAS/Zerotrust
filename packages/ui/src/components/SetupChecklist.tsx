"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

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
    href: "/verify-email",
    check: (u) => u?.emailVerified === true || u?.attributes?.emailVerified === true,
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
    <Card className="mb-6 p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Get started</h2>
        <button
          onClick={dismiss}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {completed.length}/{total} steps completed
      </p>

      <div className="mb-5 h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {ITEMS.map((item) => {
          const done = item.check(user);
          return (
            <li key={item.id}>
              {done ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground line-through">
                  <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                  {item.label}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className="flex items-center gap-3 text-sm text-foreground/80 transition-colors hover:text-foreground"
                >
                  <span className="h-4 w-4 flex-shrink-0 rounded-full border border-border" />
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
