"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@/components/Badge";
import { api } from "@/lib/api";

interface ReviewItem {
  id: string;
  userId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  rolesSnapshot: string[];
  decision: "pending" | "approved" | "revoked" | "flagged" | string;
  decidedByEmail?: string | null;
  decidedAt?: string | null;
  note?: string | null;
}

interface Review {
  id: string;
  title: string;
  status: "open" | "completed" | string;
  createdByEmail?: string | null;
  createdAt: string;
  completedAt?: string | null;
  note?: string | null;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

const DECISION_BADGE: Record<string, string> = {
  approved: "success",
  revoked: "error",
  flagged: "warning",
  pending: "pending",
};

export default function AccessReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ review: Review; items: ReviewItem[] }>(
        `/admin/access-reviews/${id}`
      );
      setReview(data.review);
      setItems(data.items ?? []);
    } catch {
      showToast("Failed to load review");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(item: ReviewItem, decision: "approved" | "revoked" | "flagged") {
    if (
      decision === "revoked" &&
      !confirm(`Revoke elevated roles for ${item.userEmail}? This sets their roles to just "user".`)
    ) {
      return;
    }
    setBusy(item.id);
    try {
      await api.patch(`/admin/access-reviews/${id}/items/${item.id}`, { decision });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, decision, decidedAt: new Date().toISOString() } : i
        )
      );
      showToast(`Marked ${decision}`);
    } catch {
      showToast("Failed to record decision");
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy("complete");
    try {
      await api.post(`/admin/access-reviews/${id}/complete`, {});
      showToast("Review completed");
      await load();
    } catch (err: any) {
      showToast(err?.message || "Cannot complete — items still pending");
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>
    );
  if (!review)
    return <div className="py-16 text-center text-muted-foreground">Review not found.</div>;

  const pending = items.filter((i) => i.decision === "pending").length;
  const isOpen = review.status !== "completed";

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3">
            {review.title}
            <Badge
              status={review.status === "completed" ? "success" : "pending"}
              label={review.status}
            />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Started by {review.createdByEmail ?? "—"} on {fmt(review.createdAt)}
            {review.completedAt && ` · completed ${fmt(review.completedAt)}`}
          </p>
        </div>
        {isOpen && (
          <button
            onClick={complete}
            disabled={busy === "complete" || pending > 0}
            title={pending > 0 ? `${pending} item(s) still pending` : "Mark review complete"}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {busy === "complete" ? "Completing…" : "Complete review"}
          </button>
        )}
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Roles (at snapshot)
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Decision
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Decided
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No privileged users were found at snapshot time.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">
                      {item.userDisplayName ?? item.userEmail}
                    </div>
                    {item.userDisplayName && (
                      <div className="text-xs text-muted-foreground">{item.userEmail}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {item.rolesSnapshot.map((r) => (
                        <span
                          key={r}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                            r === "admin"
                              ? "bg-primary/15 text-primary ring-primary/30"
                              : "bg-muted text-muted-foreground ring-border"
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      status={DECISION_BADGE[item.decision] ?? "pending"}
                      label={item.decision}
                    />
                  </td>
                  <td className="px-5 py-4 text-muted-foreground text-xs">
                    {item.decidedAt ? (
                      <>
                        {fmt(item.decidedAt)}
                        {item.decidedByEmail && <div>by {item.decidedByEmail}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {isOpen ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => decide(item, "approved")}
                          disabled={busy === item.id}
                          className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900/30 disabled:opacity-40 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => decide(item, "flagged")}
                          disabled={busy === item.id}
                          className="rounded px-2 py-1 text-xs text-orange-400 hover:bg-orange-900/30 disabled:opacity-40 transition-colors"
                        >
                          Flag
                        </button>
                        <button
                          onClick={() => decide(item, "revoked")}
                          disabled={busy === item.id}
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 disabled:opacity-40 transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">locked</span>
                    )}
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
