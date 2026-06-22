"use client";

import { ArrowDownCircle, ArrowUpCircle, Award, Coins, History } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SkeletonCard, SkeletonText } from "@/components/Skeleton";
import { api } from "../../lib/api";

interface PointsEntry {
  id: string;
  amount: number;
  balance: number;
  reason: string;
  description: string | null;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  daily_login: "Daily login",
  referral: "Referral",
  achievement: "Achievement unlocked",
  redemption: "Redemption",
  first_login: "First login bonus",
};

export default function PointsHistoryPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<PointsEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>("/auth/me/points")
      .then((data) => {
        setBalance(data.balance ?? 0);
        setHistory(data.history ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl">
        <SkeletonText className="mb-6 h-8 w-48" />
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">
        Points & Rewards
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Earn points by logging in daily and completing achievements.
      </p>

      {/* Balance cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
            <Coins className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Current balance</p>
            <p className="font-display text-3xl font-bold text-foreground">{balance ?? 0}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <Award className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total earned</p>
            <p className="font-display text-3xl font-bold text-foreground">
              {history.length > 0 ? history[0].balance : 0}
            </p>
          </div>
        </div>
      </div>

      {/* Points history ledger */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-medium text-foreground">Points History</h2>
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center">
            <Coins className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No points yet. Start logging in daily to earn points!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  {entry.amount >= 0 ? (
                    <ArrowUpCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <ArrowDownCircle className="h-5 w-5 shrink-0 text-red-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {REASON_LABELS[entry.reason] ?? entry.reason}
                    </p>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      entry.amount >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {entry.amount >= 0 ? "+" : ""}
                    {entry.amount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
