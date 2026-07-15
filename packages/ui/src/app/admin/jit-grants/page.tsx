"use client";

import { Check, Loader2, Shield, X } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/context/ToastContext";
import {
  useAdminJitGrantsQuery,
  useApproveAdminJitGrantMutation,
  useDenyAdminJitGrantMutation,
  useRevokeAdminJitGrantMutation,
} from "@/lib/server-state/adminJitGrants";

export default function AdminJitGrantsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("pending");
  const grantsQuery = useAdminJitGrantsQuery({ status: status || undefined });
  const approveMutation = useApproveAdminJitGrantMutation();
  const denyMutation = useDenyAdminJitGrantMutation();
  const revokeMutation = useRevokeAdminJitGrantMutation();

  const grants = grantsQuery.data?.grants ?? [];

  function isActing(id: string) {
    return (
      (approveMutation.isPending && approveMutation.variables === id) ||
      (denyMutation.isPending && denyMutation.variables === id) ||
      (revokeMutation.isPending && revokeMutation.variables === id)
    );
  }

  async function approve(id: string) {
    try {
      await approveMutation.mutateAsync(id);
      toast({ message: "Grant approved", type: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Action failed", type: "error" });
    }
  }

  async function deny(id: string) {
    try {
      await denyMutation.mutateAsync(id);
      toast({ message: "Grant denied", type: "error" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Action failed", type: "error" });
    }
  }

  async function revoke(id: string) {
    try {
      await revokeMutation.mutateAsync(id);
      toast({ message: "Grant revoked", type: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Action failed", type: "error" });
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <PageHeader
            title={<>JIT privilege grants</>}
            description={
              <>System-wide just-in-time access grants (distinct from cross-tenant JIT requests).</>
            }
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Grants</CardTitle>
            <CardDescription>Approve, deny, or revoke elevated role grants.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
            <ServerStateStatus query={grantsQuery} />
          </div>
        </CardHeader>
        <CardContent>
          {grantsQuery.error ? (
            <ErrorState message={grantsQuery.error.message} retry={() => grantsQuery.refetch()} />
          ) : grantsQuery.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No grants match this filter.</p>
          ) : (
            <ul className="space-y-2">
              {grants.map((g) => (
                <li key={g.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm">user {g.userId.slice(0, 8)}…</span>
                        <Badge variant="outline">{g.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{g.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Expires {new Date(g.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {g.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void approve(g.id)}
                            disabled={isActing(g.id)}
                            className="gap-1 bg-success-subtle text-success-subtle-foreground hover:bg-success-subtle/80"
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void deny(g.id)}
                            disabled={isActing(g.id)}
                            className="gap-1"
                          >
                            <X className="h-3.5 w-3.5" /> Deny
                          </Button>
                        </>
                      )}
                      {g.status === "approved" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void revoke(g.id)}
                          disabled={isActing(g.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
