"use client";

import { Shield, User } from "lucide-react";
import type { AuthMe } from "@/lib/server-state/types";

/**
 * Shows progress bars for profile completeness and SaaS onboarding steps
 * (aligned with SetupChecklist).
 */
export function ProgressBars({ user }: { user: AuthMe | null }) {
  if (!user) return null;

  const bars = [];

  // Profile completeness
  const profileFields = [
    { label: "Display name", done: !!user.displayName && user.displayName !== user.email },
    { label: "Email verified", done: user.emailVerified === true },
    { label: "Avatar", done: !!user.avatarUrl },
    {
      label: "MFA enabled",
      done:
        user?.mfa?.totp?.enabled === true ||
        user?.mfa?.webauthn?.enabled === true,
    },
  ];
  const profileComplete = profileFields.filter((f) => f.done).length;
  const profilePct = Math.round((profileComplete / profileFields.length) * 100);

  bars.push({
    label: "Profile completeness",
    pct: profilePct,
    icon: User,
    color: "bg-blue-500",
    detail: `${profileComplete}/${profileFields.length} fields`,
  });

  // Onboarding completion — same steps as SetupChecklist
  const onboardingItems = [
    { label: "Create an organization", done: user.onboarding?.hasOrg === true },
    { label: "Invite a team member", done: user.onboarding?.hasSentInvite === true },
    {
      label: "Enable two-factor authentication",
      done:
        user.onboarding?.hasMfa === true ||
        user?.mfa?.totp?.enabled === true ||
        user?.mfa?.webauthn?.enabled === true,
    },
    { label: "Create an API key", done: user.onboarding?.hasApiKey === true },
  ];
  const onboardingDone = onboardingItems.filter((i) => i.done).length;
  const onboardingPct = Math.round((onboardingDone / onboardingItems.length) * 100);

  if (onboardingPct < 100) {
    bars.push({
      label: "Onboarding progress",
      pct: onboardingPct,
      icon: Shield,
      color: "bg-emerald-500",
      detail: `${onboardingDone}/${onboardingItems.length} steps`,
    });
  }

  if (bars.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 font-medium text-foreground">Your Progress</h2>
      <div className="space-y-4">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <bar.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{bar.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{bar.detail}</span>
                <span className="text-sm font-medium text-foreground">{bar.pct}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${bar.color} transition-all`}
                style={{ width: `${bar.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
