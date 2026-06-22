"use client";

import { Flame, Zap } from "lucide-react";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string | null;
}

export function StreakDisplay({ streak }: { streak: StreakData }) {
  const { currentStreak, longestStreak } = streak;

  if (currentStreak === 0) return null;

  const nextMilestone = currentStreak < 7 ? 7 : currentStreak < 30 ? 30 : currentStreak < 100 ? 100 : null;
  const progressToNext = nextMilestone
    ? Math.round((currentStreak / nextMilestone) * 100)
    : 100;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex items-center gap-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20">
          <Flame className="h-6 w-6 text-orange-400" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Current streak</p>
          <p className="font-display text-2xl font-bold text-foreground">
            {currentStreak} <span className="text-sm font-normal text-muted-foreground">day{currentStreak !== 1 ? "s" : ""}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
          <Zap className="h-6 w-6 text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Longest streak</p>
          <p className="font-display text-2xl font-bold text-foreground">
            {longestStreak} <span className="text-sm font-normal text-muted-foreground">day{longestStreak !== 1 ? "s" : ""}</span>
          </p>
          {nextMilestone && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{currentStreak}/{nextMilestone} to next milestone</span>
                <span>{progressToNext}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-purple-500 transition-all"
                  style={{ width: `${progressToNext}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
