"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/context/ToastContext";
import {
  nextControlStatus,
  useCycleControlStatusMutation,
  useRiskAssessmentQuery,
  useSoc2ControlsQuery,
  useSoc2ReadinessQuery,
} from "@/lib/server-state/compliance";
import type { RiskItem, Soc2Control } from "@/lib/server-state/types";

const CONTROL_STATUS_VARIANT: Record<Soc2Control["status"], "success" | "warning" | "secondary"> = {
  implemented: "success",
  partial: "warning",
  planned: "secondary",
};

const RISK_STATUS_VARIANT: Record<RiskItem["status"], "success" | "warning" | "destructive"> = {
  closed: "success",
  mitigated: "warning",
  open: "destructive",
};

function riskScoreVariant(score: number): "success" | "warning" | "destructive" {
  if (score >= 12) return "destructive";
  if (score >= 6) return "warning";
  return "success";
}

export default function CompliancePage() {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const readinessQuery = useSoc2ReadinessQuery();
  const controlsQuery = useSoc2ControlsQuery();
  const riskQuery = useRiskAssessmentQuery(year);
  const cycleControlMutation = useCycleControlStatusMutation();

  const readiness = readinessQuery.data ?? null;
  const controls = controlsQuery.data ?? [];
  const risk = riskQuery.data ?? null;

  const hasSoc2Data = readiness !== null || controls.length > 0;
  const hasRiskData = risk !== null;
  const soc2Loading = readinessQuery.isPending || controlsQuery.isPending;
  const riskLoading = riskQuery.isPending;
  const soc2Error = readinessQuery.error ?? controlsQuery.error;
  const isBackgroundFetching =
    (readinessQuery.isFetching && !readinessQuery.isPending) ||
    (controlsQuery.isFetching && !controlsQuery.isPending) ||
    (riskQuery.isFetching && !riskQuery.isPending);

  function refreshAll() {
    void readinessQuery.refetch();
    void controlsQuery.refetch();
    void riskQuery.refetch();
  }

  async function cycleControlStatus(control: Soc2Control) {
    const next = nextControlStatus(control.status);
    try {
      await cycleControlMutation.mutateAsync(control);
      toast({ message: `${control.controlId} marked ${next}`, type: "success" });
    } catch {
      toast({ message: "Failed to update control", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Compliance
          </h1>
          <p className="text-sm text-muted-foreground">
            SOC 2 control readiness and the annual risk register.
          </p>
        </div>
      </div>

      <ServerStateStatus
        isFetching={isBackgroundFetching}
        isStale={readinessQuery.isStale || controlsQuery.isStale || riskQuery.isStale}
        hasData={hasSoc2Data || hasRiskData}
        label="compliance data"
        onRefresh={refreshAll}
      />

      <Tabs defaultValue="soc2">
        <TabsList>
          <TabsTrigger value="soc2">SOC 2 Controls</TabsTrigger>
          <TabsTrigger value="risk">Risk Register</TabsTrigger>
        </TabsList>

        <TabsContent value="soc2" className="space-y-6">
          {soc2Error && !hasSoc2Data ? (
            <ErrorState
              message={soc2Error.message}
              retry={() => {
                void readinessQuery.refetch();
                void controlsQuery.refetch();
              }}
            />
          ) : soc2Loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Readiness</CardDescription>
                    <CardTitle className="text-3xl">
                      {readiness ? `${readiness.readinessPercent}%` : "—"}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Implemented</CardDescription>
                    <CardTitle className="text-3xl text-emerald-500">
                      {readiness?.implemented ?? "—"}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Partial</CardDescription>
                    <CardTitle className="text-3xl text-amber-500">
                      {readiness?.partial ?? "—"}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Planned</CardDescription>
                    <CardTitle className="text-3xl text-muted-foreground">
                      {readiness?.planned ?? "—"}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Controls</CardTitle>
                  <CardDescription>
                    Click a status badge to cycle implemented → partial → planned.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Control</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="hidden lg:table-cell">Evidence</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {controls.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            No controls found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        controls.map((c) => (
                          <TableRow key={c.controlId}>
                            <TableCell className="font-mono text-xs font-medium">
                              {c.controlId}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">{c.title}</div>
                              <div className="text-xs text-muted-foreground">{c.implementation}</div>
                            </TableCell>
                            <TableCell className="hidden max-w-xs truncate font-mono text-xs text-muted-foreground lg:table-cell">
                              {c.evidence ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void cycleControlStatus(c)}
                                disabled={
                                  cycleControlMutation.isPending &&
                                  cycleControlMutation.variables?.controlId === c.controlId
                                }
                              >
                                <Badge variant={CONTROL_STATUS_VARIANT[c.status]}>{c.status}</Badge>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          {riskQuery.error && !hasRiskData ? (
            <ErrorState message={riskQuery.error.message} retry={() => void riskQuery.refetch()} />
          ) : riskLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total risks</CardDescription>
                      <CardTitle className="text-3xl">{risk?.totalRisks ?? "—"}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Open</CardDescription>
                      <CardTitle className="text-3xl text-red-500">
                        {risk?.openRisks ?? "—"}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Mitigated</CardDescription>
                      <CardTitle className="text-3xl text-amber-500">
                        {risk?.mitigatedRisks ?? "—"}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Avg score</CardDescription>
                      <CardTitle className="text-3xl">{risk?.avgRiskScore ?? "—"}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>Risk register — {year}</CardTitle>
                    <CardDescription>Annual risk assessment with treatment plans.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setYear((y) => y - 1)}
                      disabled={year <= 2020}
                    >
                      ←
                    </Button>
                    <span className="w-12 text-center text-sm font-medium">{year}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setYear((y) => y + 1)}
                      disabled={year >= new Date().getFullYear()}
                    >
                      →
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">ID</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead className="w-24">Category</TableHead>
                        <TableHead className="w-20">Score</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(risk?.risks ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No risks recorded for {year}.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (risk?.risks ?? []).map((r) => (
                          <TableRow key={r.riskId}>
                            <TableCell className="font-mono text-xs font-medium">{r.riskId}</TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">{r.title}</div>
                              <div className="text-xs text-muted-foreground">{r.mitigation}</div>
                            </TableCell>
                            <TableCell className="text-xs capitalize text-muted-foreground">
                              {r.category}
                            </TableCell>
                            <TableCell>
                              <Badge variant={riskScoreVariant(r.riskScore)}>{r.riskScore}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={RISK_STATUS_VARIANT[r.status]}>{r.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
