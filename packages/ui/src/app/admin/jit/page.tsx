"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Loader2, ShieldQuestion, X } from "lucide-react";
import { api } from "@/lib/api";

interface JITRequest {
  id: string;
  requestorUserId: string;
  requestorTenantId: string;
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

export default function AdminJITPage() {
  const [requests, setRequests] = useState<JITRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    try {
      const data = await api.get<JITRequest[]>("/jit/cross-tenant/incoming");
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, decision: "approve" | "deny") {
    setActing(id);
    try {
      await api.post(`/jit/cross-tenant/${id}/${decision}`);
      showToast(decision === "approve" ? "Request approved" : "Request denied");
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

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
          Approve or deny just-in-time access requests targeting your tenant. Approved grants
          expire automatically.
        </p>
      </div>

      {loading ? (
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
                          <span className="font-mono text-sm text-foreground">{r.targetResource}</span>
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
                        <button
                          onClick={() => act(r.id, "approve")}
                          disabled={acting === r.id}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                        >
                          {acting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Approve
                        </button>
                        <button
                          onClick={() => act(r.id, "deny")}
                          disabled={acting === r.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-700 hover:text-red-400 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Deny
                        </button>
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
                        <span className="font-mono text-sm text-foreground">{r.targetResource}</span>
                        <span className="text-xs text-muted-foreground">by {r.requestorUserId}</span>
                      </div>
                      {r.status === "approved" && r.expiresAt && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
