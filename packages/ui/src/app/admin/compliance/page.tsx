"use client";

import { ShieldCheck } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface Soc2Control {
  controlId: string;
  category: string;
  title: string;
  description?: string;
  implementation: string;
  evidence?: string;
  status: "implemented" | "partial" | "planned";
  lastReviewedAt?: string;
  reviewedBy?: string;
}

interface Soc2Readiness {
  total: number;
  implemented: number;
  partial: number;
  planned: number;
  readinessPercent: number;
}

interface RiskItem {
  year: number;
  riskId: string;
  category: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  treatment: "mitigate" | "accept" | "transfer" | "avoid";
  mitigation: string;
  owner: string;
  status: "open" | "mitigated" | "closed";
}

interface RiskAssessment {
  year: number;
  totalRisks: number;
  openRisks: number;
  mitigatedRisks: number;
  closedRisks: number;
  avgRiskScore: number;
  risks: RiskItem[];
}

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

const CONTROL_STATUSES: Soc2Control["status"][] = ["implemented", "partial", "planned"];

export default function CompliancePage() {
  const { toast } = useToast();
  const [readiness, setReadiness] = useState<Soc2Readiness | null>(null);
  const [controls, setControls] = useState<Soc2Control[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, ra] = await Promise.all([
        api.get<Soc2Readiness>("/compliance/soc2/readiness"),
        api.get<{ data: Soc2Control[]; pagination: any }>("/compliance/soc2/controls"),
        api.get<RiskAssessment>(`/compliance/risk-assessment/${year}`),
      ]);
      setReadiness(r);
      setControls(c.data ?? []);
      setRisk(ra);
    } catch {
      toast({ message: "Failed to load compliance data", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [year, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cycleControlStatus(control: Soc2Control) {
    const idx = CONTROL_STATUSES.indexOf(control.status);
    const next = CONTROL_STATUSES[(idx + 1) % CONTROL_STATUSES.length];
    // Optimistic update
    setControls((prev) =>
      prev.map((c) => (c.controlId === control.controlId ? { ...c, status: next } : c))
    );
    try {
      await api.put(`/compliance/soc2/controls/${control.controlId}`, { status: next });
      api.invalidateCache("/compliance/soc2");
      toast({ message: `${control.controlId} marked ${next}`, type: "success" });
      // Refresh readiness to reflect the change
      const r = await api.get<Soc2Readiness>("/compliance/soc2/readiness");
      setReadiness(r);
    } catch {
      toast({ message: "Failed to update control", type: "error" });
      setControls((prev) =>
        prev.map((c) => (c.controlId === control.controlId ? { ...c, status: control.status } : c))
      );
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

      <Tabs defaultValue="soc2">
        <TabsList>
          <TabsTrigger value="soc2">SOC 2 Controls</TabsTrigger>
          <TabsTrigger value="risk">Risk Register</TabsTrigger>
        </TabsList>

        {/* ── SOC 2 ──────────────────────────────────────────────────── */}
        <TabsContent value="soc2" className="space-y-6">
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
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
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
                          <button type="button" onClick={() => cycleControlStatus(c)}>
                            <Badge variant={CONTROL_STATUS_VARIANT[c.status]}>{c.status}</Badge>
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Risk Register ──────────────────────────────────────────── */}
        <TabsContent value="risk" className="space-y-6">
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
                  <CardTitle className="text-3xl text-red-500">{risk?.openRisks ?? "—"}</CardTitle>
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
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
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
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
