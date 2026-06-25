"use client";

import {
  Banknote,
  CheckCircle2,
  Download,
  Megaphone,
  Send,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import DonutChart from "@/components/admin/DonutChart";
import MetricCard from "@/components/admin/MetricCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

interface RevenueData {
  mrr: number;
  arr: number;
  currency: string;
  activeSubscriptions: number;
  byPlan: Record<string, number>;
  trialing: number;
  pastDue: number;
  canceledLast30Days: number;
  churnRatePercent: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcast, setBroadcast] = useState({
    title: "",
    message: "",
    segment: "all",
  });
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RevenueData>("/admin/revenue")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function sendBroadcast() {
    try {
      const res = await api.post<{ recipients: number }>("/admin/broadcast", {
        ...broadcast,
        sendEmail: false,
      });
      setBroadcastResult(`Sent to ${res.recipients} user(s)`);
      setBroadcast({ title: "", message: "", segment: "all" });
    } catch {
      setBroadcastResult("Failed to send broadcast");
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const oauthBase = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:3000";

  const inputClasses =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Revenue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            MRR, churn and subscription health at a glance
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`${oauthBase}/admin/users/export`}>
              <Download />
              Export CSV
            </a>
          </Button>
          <Button size="sm" onClick={() => setBroadcastOpen((v) => !v)}>
            <Megaphone />
            Broadcast
          </Button>
        </div>
      </div>

      {broadcastOpen && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="font-medium text-foreground">Send announcement</h2>
          <input
            value={broadcast.title}
            onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
            placeholder="Title"
            className={inputClasses}
          />
          <textarea
            value={broadcast.message}
            onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
            placeholder="Message"
            rows={3}
            className={inputClasses}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={broadcast.segment}
              onValueChange={(v) => setBroadcast({ ...broadcast, segment: v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="free">Free plan</SelectItem>
                <SelectItem value="pro">Pro plan</SelectItem>
                <SelectItem value="enterprise">Enterprise plan</SelectItem>
                <SelectItem value="inactive">Inactive 30+ days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={sendBroadcast}
              disabled={!broadcast.title || !broadcast.message}
              size="sm"
            >
              <Send />
              Send
            </Button>
            {broadcastResult && (
              <span className="text-sm text-muted-foreground">{broadcastResult}</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Banknote}
              label="MRR"
              value={fmt(data.mrr)}
              hint={data.currency?.toUpperCase()}
            />
            <MetricCard icon={TrendingUp} label="ARR" value={fmt(data.arr)} />
            <MetricCard
              icon={CheckCircle2}
              label="Active subscriptions"
              value={data.activeSubscriptions}
            />
            <MetricCard
              icon={TrendingDown}
              label="Churn (30d)"
              value={`${data.churnRatePercent}%`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-medium text-foreground">Subscriptions by plan</h2>
              {Object.keys(data.byPlan).length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscriptions yet</p>
              ) : (
                <DonutChart
                  labels={Object.keys(data.byPlan).map(cap)}
                  series={Object.values(data.byPlan)}
                />
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-medium text-foreground">Health</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/80">In trial</span>
                  <span className="text-sm font-semibold text-blue-400">{data.trialing}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/80">Past due (dunning)</span>
                  <span className="text-sm font-semibold text-amber-400">{data.pastDue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/80">Canceled (last 30 days)</span>
                  <span className="text-sm font-semibold text-red-400">
                    {data.canceledLast30Days}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Failed to load revenue data.</p>
      )}
    </div>
  );
}
