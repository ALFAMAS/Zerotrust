"use client";

import { Clock, Loader2, ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface JITRequest {
  id: string;
  targetTenantId: string;
  targetResource: string;
  justification: string;
  ttlSeconds: number;
  status: "pending" | "approved" | "denied" | "expired";
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<JITRequest["status"], string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  approved: "border-green-500/30 bg-green-500/10 text-green-400",
  denied: "border-red-500/30 bg-red-500/10 text-red-400",
  expired: "border-border bg-muted text-muted-foreground",
};

export default function JITRequestPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<JITRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    targetTenantId: "",
    targetResource: "",
    justification: "",
    ttlMinutes: 60,
  });

  const load = useCallback(async () => {
    try {
      const data = await api.get<JITRequest[]>("/jit/cross-tenant");
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      // leave list empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.targetTenantId || !form.targetResource || !form.justification) return;
    setSubmitting(true);
    try {
      await api.post("/jit/cross-tenant", {
        targetTenantId: form.targetTenantId.trim(),
        targetResource: form.targetResource.trim(),
        justification: form.justification.trim(),
        ttlSeconds: Math.min(form.ttlMinutes * 60, 3600),
      });
      toast({ message: "Access request submitted for approval", type: "success" });
      setForm({ targetTenantId: "", targetResource: "", justification: "", ttlMinutes: 60 });
      load();
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to submit request",
        type: "error",
      });
    } finally {
      setSubmitting(false);
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
            <label className="text-sm font-medium text-foreground">Target tenant ID</label>
            <input
              value={form.targetTenantId}
              onChange={(e) => setForm({ ...form, targetTenantId: e.target.value })}
              placeholder="acme-corp"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Resource</label>
            <input
              value={form.targetResource}
              onChange={(e) => setForm({ ...form, targetResource: e.target.value })}
              placeholder="admin:users:read"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Justification</label>
          <textarea
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
            <label className="text-sm font-medium text-foreground">Duration (minutes)</label>
            <input
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
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldQuestion className="h-4 w-4" />
            )}
            Request access
          </button>
        </div>
      </form>

      <div>
        <h2 className="mb-3 font-medium text-foreground">My requests</h2>
        {loading ? (
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
                    <span className="text-xs text-muted-foreground">@ {r.targetTenantId}</span>
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
