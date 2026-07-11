"use client";

import { Check, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOnboardingCompleteMutation } from "@/lib/server-state/auth";
import type { AuthMe } from "@/lib/server-state/types";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  check: (user: AuthMe) => boolean;
}

const ITEMS: ChecklistItem[] = [
  {
    id: "create_org",
    label: "Create an organization",
    href: "/dashboard/organizations",
    check: (u) => u?.onboarding?.hasOrg === true,
  },
  {
    id: "invite_member",
    label: "Invite a team member",
    href: "/dashboard/organizations",
    check: (u) => u?.onboarding?.hasSentInvite === true,
  },
  {
    id: "mfa_enabled",
    label: "Enable two-factor authentication",
    href: "/dashboard/security",
    check: (u) =>
      u?.onboarding?.hasMfa === true || u?.mfa?.totp?.enabled === true || u?.mfa?.webauthn?.enabled === true,
  },
  {
    id: "api_key",
    label: "Create an API key",
    href: "/dashboard/api-keys",
    check: (u) => u?.onboarding?.hasApiKey === true,
  },
];

const DISMISS_KEY = "za_setup_checklist_dismissed";

export default function SetupChecklist({ user }: { user: AuthMe | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  const { mutate: markOnboardingComplete } = useOnboardingCompleteMutation();

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  const completed = user ? ITEMS.filter((i) => i.check(user)) : [];
  const total = ITEMS.length;
  const allDone = !!user && completed.length === total;

  useEffect(() => {
    if (allDone && !celebrated) {
      setCelebrated(true);
      markOnboardingComplete();
    }
  }, [allDone, celebrated, markOnboardingComplete]);

  if (!user || dismissed) return null;

  if (allDone) {
    return (
      <Card className="mb-6 border-primary/40 bg-primary/5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              🎉 Onboarding complete!
            </h3>
            <p className="text-sm text-muted-foreground">
              You&apos;ve completed all setup steps. You&apos;re all set to make the most of
              zerotrust.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const pct = Math.round((completed.length / total) * 100);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <Card className="mb-6 p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Get started</h2>
        <Button type="button" onClick={dismiss} variant="ghost" size="sm">
          Dismiss
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {completed.length}/{total} steps completed
      </p>

      <div className="mb-5 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
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
