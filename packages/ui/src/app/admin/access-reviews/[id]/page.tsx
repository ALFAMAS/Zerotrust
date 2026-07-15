"use client";

import { useParams, useRouter } from "next/navigation";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
  useAccessReviewDetailQuery,
  useCompleteAccessReviewMutation,
  useDecideAccessReviewItemMutation,
} from "@/lib/server-state/accessReviews";
import type { AccessReviewDecision, AccessReviewItem } from "@/lib/server-state/types";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

const DECISION_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  approved: "success",
  revoked: "destructive",
  flagged: "warning",
  pending: "secondary",
};

export default function AccessReviewDetailPage() {
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const detailQuery = useAccessReviewDetailQuery(id);
  const decideMutation = useDecideAccessReviewItemMutation();
  const completeMutation = useCompleteAccessReviewMutation();

  const review = detailQuery.data?.review ?? null;
  const items = detailQuery.data?.items ?? [];
  const loading = detailQuery.isLoading;
  const error = detailQuery.error;
  const busyId = decideMutation.isPending
    ? (decideMutation.variables?.itemId ?? null)
    : completeMutation.isPending
      ? "complete"
      : null;

  async function decide(item: AccessReviewItem, decision: AccessReviewDecision) {
    if (
      decision === "revoked" &&
      !confirm(`Revoke elevated roles for ${item.userEmail}? This sets their roles to just "user".`)
    ) {
      return;
    }
    try {
      await decideMutation.mutateAsync({ reviewId: id, itemId: item.id, decision });
      toast({ message: `Marked ${decision}`, type: "success" });
    } catch {
      toast({ message: "Failed to record decision", type: "error" });
    }
  }

  async function complete() {
    try {
      await completeMutation.mutateAsync(id);
      toast({ message: "Review completed", type: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cannot complete — items still pending";
      toast({ message: message, type: "error" });
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error.message || "Failed to load review"}
        retry={() => detailQuery.refetch()}
      />
    );
  }

  if (!review) {
    return <div className="py-8 text-center text-muted-foreground">Review not found.</div>;
  }

  const pending = review.pendingCount ?? items.filter((i) => i.decision === "pending").length;
  const isOpen = review.status !== "completed";

  return (
    <div className="space-y-6">
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
          <PageHeader
            title={
              <>
                {review.title}
                <Badge variant={review.status === "completed" ? "success" : "warning"}>
                  {review.status}
                </Badge>
              </>
            }
            description={
              <>
                Started by {review.createdByEmail ?? "—"} on {fmt(review.createdAt)}
                {review.completedAt && ` · completed ${fmt(review.completedAt)}`}
              </>
            }
          />
        </div>
        <div className="flex items-center gap-3">
          <ServerStateStatus query={detailQuery} />
          {isOpen && (
            <Button
              type="button"
              onClick={complete}
              disabled={busyId === "complete" || pending > 0}
              title={pending > 0 ? `${pending} item(s) still pending` : "Mark review complete"}
            >
              {busyId === "complete" ? "Completing…" : "Complete review"}
            </Button>
          )}
        </div>
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
                            className="text-success-subtle-foreground hover:text-success-subtle-foreground"
                            onClick={() => decide(item, "approved")}
                            disabled={busyId === item.id}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-warning-subtle-foreground hover:text-warning-subtle-foreground"
                            onClick={() => decide(item, "flagged")}
                            disabled={busyId === item.id}
                          >
                            Flag
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => decide(item, "revoked")}
                            disabled={busyId === item.id}
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
