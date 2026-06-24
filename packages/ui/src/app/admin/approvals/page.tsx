"use client";

import { Bot, Check, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface ApprovalPrincipal {
  type: "human" | "agent";
  id: string;
  workloadId?: string;
  actAs?: string[];
}

interface ApprovalChallenge {
  id: string;
  action: string;
  description: string;
  principal: ApprovalPrincipal;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  metadata?: Record<string, unknown>;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  total: number;
}

function describePrincipal(p: ApprovalPrincipal): string {
  const base = p.type === "agent" ? `agent ${p.workloadId ?? p.id}` : `user ${p.id}`;
  return p.actAs && p.actAs.length > 0 ? `${base} on behalf of ${p.actAs.join(" → ")}` : base;
}

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalChallenge[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ approvals: ApprovalChallenge[]; stats: ApprovalStats }>(
        "/agentic/admin/approvals"
      );
      setApprovals(data.approvals ?? []);
      setStats(data.stats ?? null);
    } catch {
      toast({ message: "Failed to load approvals", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    try {
      await api.post(`/agentic/admin/approvals/${id}/${decision}`, {});
      api.invalidateCache("/agentic/admin/approvals");
      toast({
        message: decision === "approve" ? "Approved" : "Rejected",
        type: decision === "approve" ? "success" : "info",
      });
      await load();
    } catch {
      toast({ message: `Failed to ${decision}`, type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Agent Approvals
          </h1>
          <p className="text-sm text-muted-foreground">
            Human-in-the-loop review for sensitive actions requested by agents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl text-amber-500">{stats?.pending ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-3xl text-emerald-500">{stats?.approved ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
            <CardTitle className="text-3xl text-red-500">{stats?.rejected ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expired</CardDescription>
            <CardTitle className="text-3xl text-muted-foreground">
              {stats?.expired ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending requests</CardTitle>
          <CardDescription>
            Approve or reject within the request&apos;s time window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead className="w-24">Expires</TableHead>
                <TableHead className="w-40 text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && approvals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No pending approvals. Agent requests for sensitive actions will appear here.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                approvals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Badge variant="outline" className="font-mono">
                          {a.action}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{a.description}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Bot className="h-3.5 w-3.5 shrink-0" />
                        {describePrincipal(a.principal)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeLeft(a.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === a.id}
                          onClick={() => decide(a.id, "reject")}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === a.id}
                          onClick={() => decide(a.id, "approve")}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
