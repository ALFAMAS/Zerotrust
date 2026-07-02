"use client";

import { Check, Clock, Loader2, ShieldQuestion, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/States";
import {
  useApproveJitRequestMutation,
  useDenyJitRequestMutation,
  useIncomingJitRequestsQuery,
} from "@/lib/server-state/jit";
import type { JitRequestStatus } from "@/lib/server-state/types";

const STATUS_STYLES: Record<JitRequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  approved: "border-green-500/30 bg-green-500/10 text-green-400",
  denied: "border-red-500/30 bg-red-500/10 text-red-400",
  expired: "border-border bg-muted text-muted-foreground",
};

export default function AdminJITPage() {
  const incomingQuery = useIncomingJitRequestsQuery();
  const approveMutation = useApproveJitRequestMutation();
  const denyMutation = useDenyJitRequestMutation();
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const requests = incomingQuery.data ?? [];
  const hasRequests = requests.length > 0;
  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  function isActing(id: string) {
    return (
      (approveMutation.isPending && approveMutation.variables === id) ||
      (denyMutation.isPending && denyMutation.variables === id)
    );
  }

  async function approve(id: string) {
    try {
      await approveMutation.mutateAsync(id);
      showToast("Request approved");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function deny(id: string) {
    try {
      await denyMutation.mutateAsync(id);
      showToast("Request denied");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Cross-tenant access requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve or deny just-in-time access requests targeting your tenant. Approved grants expire
          automatically.
        </p>
      </div>

      <ServerStateStatus
        isFetching={incomingQuery.isFetching && !incomingQuery.isPending}
        isStale={incomingQuery.isStale}
        hasData={hasRequests}
        label="JIT requests"
        onRefresh={() => void incomingQuery.refetch()}
      />

      {incomingQuery.error && !hasRequests ? (
        <ErrorState
          message={incomingQuery.error.message}
          retry={() => void incomingQuery.refetch()}
        />
      ) : incomingQuery.isPending ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-medium text-foreground">
              <ShieldQuestion className="h-4 w-4 text-amber-400" />
              Pending approval ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No requests waiting for your approval.
              </div>
            ) : (
              <ul className="space-y-2">
                {pending.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-foreground">
                            {r.targetResource}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            requested by {r.requestorUserId}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{r.justification}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Duration {Math.round(r.ttlSeconds / 60)} min · requested{" "}
                          {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          onClick={() => void approve(r.id)}
                          disabled={isActing(r.id)}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                        >
                          {isActing(r.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          onClick={() => void deny(r.id)}
                          disabled={isActing(r.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-700 hover:text-red-400 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {resolved.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-medium text-foreground">History</h2>
              <ul className="space-y-2">
                {resolved.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-foreground">
                          {r.targetResource}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {r.requestorUserId}
                        </span>
                      </div>
                      {r.status === "approved" && r.expiresAt && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> expires{" "}
                          {new Date(r.expiresAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
