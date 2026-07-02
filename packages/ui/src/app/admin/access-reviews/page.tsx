"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAccessReviewsListQuery,
  useStartAccessReviewMutation,
} from "@/lib/server-state/accessReviews";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function AccessReviewsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reviewsQuery = useAccessReviewsListQuery();
  const startMutation = useStartAccessReviewMutation();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const reviews = reviewsQuery.data?.reviews ?? [];
  const loading = reviewsQuery.isLoading;
  const error = reviewsQuery.error;

  async function startReview() {
    try {
      const res = await startMutation.mutateAsync();
      showToast(`Review started — ${res.itemCount} privileged user(s) to review`);
    } catch {
      showToast("Failed to start review");
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
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
        <div className="flex items-center gap-3">
          <ServerStateStatus query={reviewsQuery} />
          <Button
            type="button"
            onClick={startReview}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? "Starting…" : "Start new review"}
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState
          message={error.message || "Failed to load access reviews"}
          retry={() => reviewsQuery.refetch()}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Review</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Started by</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && reviews.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No access reviews yet. Start one to snapshot current privileged grants.
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    reviews.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            href={`/admin/access-reviews/${r.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "completed" ? "success" : "warning"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(r.itemCount ?? 0) - (r.pendingCount ?? 0)}/{r.itemCount ?? 0} decided
                          {(r.pendingCount ?? 0) > 0 && (
                            <span className="ml-1 text-amber-500">
                              ({r.pendingCount} pending)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.createdByEmail ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(r.completedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
