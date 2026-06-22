"use client";

import { Award } from "lucide-react";

interface Achievement {
  key: string;
  label: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export function AchievementBadges({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Award className="h-5 w-5 text-primary" />
        <h2 className="font-medium text-foreground">Achievements</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {achievements.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {achievements.map((a) => (
          <div
            key={a.key}
            className="group relative flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40"
          >
            <span className="text-2xl" role="img" aria-label={a.label}>
              {a.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </div>
            {a.unlockedAt && (
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(a.unlockedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
