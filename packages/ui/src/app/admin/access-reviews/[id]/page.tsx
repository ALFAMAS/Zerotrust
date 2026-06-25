"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const DECISION_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  approved: "success",
  revoked: "destructive",
  flagged: "warning",
  pending: "secondary",
};

export default function AccessReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
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
  }, [id, showToast]);

  useEffect(() => {
    void load();
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
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => router.back()}
          >
            ← Back
          </Button>
          <h1 className="mt-2 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight text-foreground">
            {review.title}
            <Badge variant={review.status === "completed" ? "success" : "warning"}>
              {review.status}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Started by {review.createdByEmail ?? "—"} on {fmt(review.createdAt)}
            {review.completedAt && ` · completed ${fmt(review.completedAt)}`}
          </p>
        </div>
        {isOpen && (
          <Button
            type="button"
            onClick={complete}
            disabled={busy === "complete" || pending > 0}
            title={pending > 0 ? `${pending} item(s) still pending` : "Mark review complete"}
          >
            {busy === "complete" ? "Completing…" : "Complete review"}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles (at snapshot)</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Decided</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No privileged users were found at snapshot time.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {item.userDisplayName ?? item.userEmail}
                      </div>
                      {item.userDisplayName && (
                        <div className="text-xs text-muted-foreground">{item.userEmail}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.rolesSnapshot.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={DECISION_VARIANT[item.decision] ?? "secondary"}>
                        {item.decision}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.decidedAt ? (
                        <>
                          {fmt(item.decidedAt)}
                          {item.decidedByEmail && <div>by {item.decidedByEmail}</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isOpen ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-600"
                            onClick={() => decide(item, "approved")}
                            disabled={busy === item.id}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:text-amber-600"
                            onClick={() => decide(item, "flagged")}
                            disabled={busy === item.id}
                          >
                            Flag
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => decide(item, "revoked")}
                            disabled={busy === item.id}
                          >
                            Revoke
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">locked</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
