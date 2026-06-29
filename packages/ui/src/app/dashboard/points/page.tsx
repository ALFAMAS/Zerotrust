"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Award,
  Coins,
  Gift,
  History,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SkeletonCard, SkeletonText } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface PointsEntry {
  id: string;
  amount: number;
  balance: number;
  reason: string;
  description: string | null;
  createdAt: string;
}

interface Tier {
  key: string;
  name: string;
  multiplier: number;
  perks: string[];
}

interface RedemptionItem {
  id: string;
  key: string;
  name: string;
  description: string;
  cost: number;
}

const REASON_LABELS: Record<string, string> = {
  daily_login: "Daily login",
  referral: "Referral",
  achievement: "Achievement unlocked",
  redemption: "Redemption",
  first_login: "First login bonus",
};

export default function PointsHistoryPage() {
  const { toast } = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<PointsEntry[]>([]);
  const [tier, setTier] = useState<Tier | null>(null);
  const [catalog, setCatalog] = useState<RedemptionItem[]>([]);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [points, tierRes, cat] = await Promise.all([
        api.get<{ balance?: number; history?: PointsEntry[] }>("/auth/me/points"),
        api.get<{ tier: Tier | null }>("/wallet/tier").catch(() => ({ tier: null })),
        api
          .get<{ items: RedemptionItem[] }>("/wallet/redemptions/catalog")
          .catch(() => ({ items: [] })),
      ]);
      setBalance(points.balance ?? 0);
      setHistory(points.data ?? points.history ?? []);
      setTier(tierRes.tier);
      setCatalog(cat.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(item: RedemptionItem) {
    if ((balance ?? 0) < item.cost) {
      toast({ message: "Not enough points for this reward", type: "error" });
      return;
    }
    setRedeeming(item.key);
    try {
      await api.post("/wallet/redemptions", { key: item.key });
      toast({ message: `Redeemed: ${item.name}`, type: "success" });
      await load();
    } catch (err) {
      toast({ message: (err as Error).message || "Redemption failed", type: "error" });
    } finally {
      setRedeeming(null);
    }
  }

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

      {/* Loyalty tier */}
      {tier && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20">
            <Sparkles className="h-6 w-6 text-violet-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Your tier</p>
            <p className="font-display text-xl font-bold text-foreground">
              {tier.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {tier.multiplier}× points
              </span>
            </p>
            {tier.perks.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">{tier.perks.join(" · ")}</p>
            )}
          </div>
        </div>
      )}

      {/* Redemption catalog */}
      {catalog.length > 0 && (
        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h2 className="font-medium text-foreground">Redeem your points</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {catalog.map((item) => {
              const affordable = (balance ?? 0) >= item.cost;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-4"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-400">{item.cost} pts</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={affordable ? "default" : "outline"}
                      disabled={!affordable || redeeming === item.key}
                      onClick={() => redeem(item)}
                    >
                      {redeeming === item.key ? "Redeeming…" : "Redeem"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
