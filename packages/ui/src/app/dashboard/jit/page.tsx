"use client";

import { Clock, Loader2, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/States";
import { Textarea } from "@/components/ui/textarea";
import { useMyJitRequestsQuery, useSubmitJitRequestMutation } from "@/lib/server-state/jit";
import type { JitRequestStatus } from "@/lib/server-state/types";
import { useToast } from "@/lib/toast";

const STATUS_STYLES: Record<JitRequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  approved: "border-green-500/30 bg-green-500/10 text-green-400",
  denied: "border-red-500/30 bg-red-500/10 text-red-400",
  expired: "border-border bg-muted text-muted-foreground",
};

export default function JITRequestPage() {
  const { toast } = useToast();
  const requestsQuery = useMyJitRequestsQuery();
  const submitMutation = useSubmitJitRequestMutation();
  const [form, setForm] = useState({
    targetOrgId: "",
    targetResource: "",
    justification: "",
    ttlMinutes: 60,
  });

  const requests = requestsQuery.data ?? [];
  const hasRequests = requests.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.targetOrgId || !form.targetResource || !form.justification) return;
    try {
      await submitMutation.mutateAsync({
        targetOrgId: form.targetOrgId.trim(),
        targetResource: form.targetResource.trim(),
        justification: form.justification.trim(),
        ttlSeconds: Math.min(form.ttlMinutes * 60, 3600),
      });
      toast({ message: "Access request submitted for approval", type: "success" });
      setForm({ targetOrgId: "", targetResource: "", justification: "", ttlMinutes: 60 });
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to submit request",
        type: "error",
      });
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Cross-tenant access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request temporary, just-in-time access to a resource in another tenant. Grants require
          admin approval and expire automatically (max 1 hour).
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="page-f0" className="text-sm font-medium text-foreground">
              Target organization ID
            </label>
            <Input
              id="page-f0"
              value={form.targetOrgId}
              onChange={(e) => setForm({ ...form, targetOrgId: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000001"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-f1" className="text-sm font-medium text-foreground">
              Resource
            </label>
            <Input
              id="page-f1"
              value={form.targetResource}
              onChange={(e) => setForm({ ...form, targetResource: e.target.value })}
              placeholder="admin:users:read"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="page-f2" className="text-sm font-medium text-foreground">
            Justification
          </label>
          <Textarea
            id="page-f2"
            value={form.justification}
            onChange={(e) => setForm({ ...form, justification: e.target.value })}
            placeholder="Why do you need this access?"
            required
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1.5">
            <label htmlFor="page-f3" className="text-sm font-medium text-foreground">
              Duration (minutes)
            </label>
            <Input
              id="page-f3"
              type="number"
              min={5}
              max={60}
              value={form.ttlMinutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  ttlMinutes: Math.min(60, Math.max(5, Number(e.target.value) || 60)),
                })
              }
              className="w-28 rounded-lg border border-border bg-muted px-3 py-2 text-right text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <Button
            type="submit"
            disabled={submitMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldQuestion className="h-4 w-4" />
            )}
            Request access
          </Button>
        </div>
      </form>

      <div>
        <h2 className="mb-3 font-medium text-foreground">My requests</h2>

        <ServerStateStatus
          isFetching={requestsQuery.isFetching && !requestsQuery.isPending}
          isStale={requestsQuery.isStale}
          hasData={hasRequests}
          label="JIT requests"
          onRefresh={() => void requestsQuery.refetch()}
        />

        {requestsQuery.error && !hasRequests ? (
          <ErrorState
            message={requestsQuery.error.message}
            retry={() => void requestsQuery.refetch()}
          />
        ) : requestsQuery.isPending ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t requested any cross-tenant access yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{r.targetResource}</span>
                    <span className="text-xs text-muted-foreground">→ {r.targetOrgId}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.justification}
                  </p>
                  {r.status === "approved" && r.expiresAt && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
                      <Clock className="h-3 w-3" /> expires {new Date(r.expiresAt).toLocaleString()}
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
        )}
      </div>
    </div>
  );
}
