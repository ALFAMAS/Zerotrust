"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";

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

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcast, setBroadcast] = useState({ title: "", message: "", segment: "all" });
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

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue</h1>
          <p className="mt-1 text-sm text-gray-400">
            MRR, churn and subscription health at a glance
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000"}/admin/users/export`}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
          >
            Export users CSV
          </a>
          <button
            onClick={() => setBroadcastOpen((v) => !v)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Broadcast
          </button>
        </div>
      </div>

      {broadcastOpen && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Send announcement</h2>
          <input
            value={broadcast.title}
            onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
            placeholder="Title"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <textarea
            value={broadcast.message}
            onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
            placeholder="Message"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <div className="flex items-center gap-3">
            <select
              value={broadcast.segment}
              onChange={(e) => setBroadcast({ ...broadcast, segment: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="all">All users</option>
              <option value="free">Free plan</option>
              <option value="pro">Pro plan</option>
              <option value="enterprise">Enterprise plan</option>
              <option value="inactive">Inactive 30+ days</option>
            </select>
            <button
              onClick={sendBroadcast}
              disabled={!broadcast.title || !broadcast.message}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              Send
            </button>
            {broadcastResult && <span className="text-sm text-gray-400">{broadcastResult}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-900 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="MRR" value={fmt(data.mrr)} icon="💰" color="green" />
            <StatCard title="ARR" value={fmt(data.arr)} icon="📈" color="blue" />
            <StatCard
              title="Active subscriptions"
              value={data.activeSubscriptions}
              icon="✅"
              color="indigo"
            />
            <StatCard
              title="Churn (30d)"
              value={`${data.churnRatePercent}%`}
              icon="📉"
              color="red"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Subscriptions by plan</h2>
              <div className="space-y-3">
                {Object.entries(data.byPlan).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 capitalize">{plan}</span>
                    <span className="text-sm font-semibold text-white">{count}</span>
                  </div>
                ))}
                {Object.keys(data.byPlan).length === 0 && (
                  <p className="text-sm text-gray-500">No subscriptions yet</p>
                )}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Health</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">In trial</span>
                  <span className="text-sm font-semibold text-blue-400">{data.trialing}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Past due (dunning)</span>
                  <span className="text-sm font-semibold text-yellow-400">{data.pastDue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Canceled (last 30 days)</span>
                  <span className="text-sm font-semibold text-red-400">
                    {data.canceledLast30Days}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">Failed to load revenue data.</p>
      )}
    </div>
  );
}
