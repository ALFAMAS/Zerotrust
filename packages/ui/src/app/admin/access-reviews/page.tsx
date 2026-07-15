"use client";

import Link from "next/link";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DataRegion } from "@/components/ui/page-patterns";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/context/ToastContext";
import {
  useAccessReviewsListQuery,
  useStartAccessReviewMutation,
} from "@/lib/server-state/accessReviews";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function AccessReviewsPage() {
  const { toast } = useToast();

  const reviewsQuery = useAccessReviewsListQuery();
  const startMutation = useStartAccessReviewMutation();

  const reviews = reviewsQuery.data?.reviews ?? [];
  const loading = reviewsQuery.isLoading;
  const error = reviewsQuery.error;

  async function startReview() {
    try {
      const res = await startMutation.mutateAsync();
      toast({
        message: `Review started — ${res.itemCount} privileged user(s) to review`,
        type: "success",
      });
    } catch {
      toast({ message: "Failed to start review", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            title={<>Access Reviews</>}
            description={
              <>Periodic review of privileged (non-default) role grants — SOC 2 CC6 evidence.</>
            }
          />
        </div>
        <div className="flex items-center gap-3">
          <ServerStateStatus query={reviewsQuery} />
          <Button type="button" onClick={startReview} disabled={startMutation.isPending}>
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
        <DataRegion
          title="Review history"
          description="Privileged access snapshots and their review progress."
        >
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
                          <span className="ml-1 text-warning-subtle-foreground">
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
        </DataRegion>
      )}
    </div>
  );
}
