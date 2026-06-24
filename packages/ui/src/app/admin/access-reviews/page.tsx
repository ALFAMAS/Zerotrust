"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@/components/Badge";
import { api } from "@/lib/api";

interface Review {
  id: string;
  title: string;
  status: "open" | "completed" | string;
  createdByEmail?: string | null;
  createdAt: string;
  completedAt?: string | null;
  itemCount: number;
  pendingCount: number;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function AccessReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ reviews: Review[] }>("/admin/access-reviews");
      setReviews(data.reviews ?? []);
    } catch {
      showToast("Failed to load access reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startReview() {
    setCreating(true);
    try {
      const res = await api.post<{ itemCount: number }>("/admin/access-reviews", {});
      showToast(`Review started — ${res.itemCount} privileged user(s) to review`);
      await load();
    } catch {
      showToast("Failed to start review");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Access Reviews
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Periodic review of privileged (non-default) role grants — SOC 2 CC6 evidence.
          </p>
        </div>
        <button
          type="button"
          onClick={startReview}
          disabled={creating}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {creating ? "Starting…" : "Start new review"}
        </button>
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Review
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Started by
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Completed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && reviews.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    No access reviews yet. Start one to snapshot current privileged grants.
                  </td>
                </tr>
              )}
              {!loading &&
                reviews.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/access-reviews/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        status={r.status === "completed" ? "success" : "pending"}
                        label={r.status}
                      />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {r.itemCount - r.pendingCount}/{r.itemCount} decided
                      {r.pendingCount > 0 && (
                        <span className="ml-1 text-yellow-400">({r.pendingCount} pending)</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {r.createdByEmail ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">{fmt(r.createdAt)}</td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {fmt(r.completedAt)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
