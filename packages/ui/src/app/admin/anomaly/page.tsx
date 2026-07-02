"use client";

import { Activity, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/ui/States";
import { riskBand } from "@/lib/anomaly";
import {
  useAnomalyBaselinesQuery,
  useResetBaselineMutation,
  useScoreLoginMutation,
} from "@/lib/server-state/anomaly";

const LIST_PARAMS = { limit: 100 } as const;

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function AnomalyPage() {
  const baselinesQuery = useAnomalyBaselinesQuery(LIST_PARAMS);
  const resetMutation = useResetBaselineMutation(LIST_PARAMS);
  const scoreMutation = useScoreLoginMutation();
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    userId: "",
    ip: "",
    country: "",
    deviceHash: "",
    loginHour: String(new Date().getHours()),
  });

  const baselines = baselinesQuery.data?.data ?? [];
  const hasBaselines = baselines.length > 0;
  const signals = scoreMutation.data ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleReset(userId: string) {
    try {
      await resetMutation.mutateAsync(userId);
      showToast("Baseline reset");
    } catch {
      showToast("Failed to reset baseline");
    }
  }

  async function handleScore(e: React.FormEvent) {
    e.preventDefault();
    scoreMutation.reset();
    try {
      await scoreMutation.mutateAsync({
        userId: form.userId.trim(),
        ip: form.ip.trim(),
        country: form.country.trim() || null,
        deviceHash: form.deviceHash.trim(),
        loginHour: Number(form.loginHour),
      });
    } catch {
      // Error surfaced via scoreMutation.error below
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Anomaly Detection
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-user behavior baselines and on-demand login risk scoring.
          </p>
        </div>
      </div>

      {/* Risk-scoring panel */}
      <Card>
        <CardHeader>
          <CardTitle>Score a login</CardTitle>
          <CardDescription>
            Evaluate a hypothetical sign-in against a user&apos;s learned baseline. The score is
            0–1; flags explain which signals deviated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScore} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="userId">User ID</Label>
              <Input
                id="userId"
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                placeholder="uuid"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip">IP address</Label>
              <Input
                id="ip"
                value={form.ip}
                onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                placeholder="203.0.113.5"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country (optional)</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="US"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deviceHash">Device hash</Label>
              <Input
                id="deviceHash"
                value={form.deviceHash}
                onChange={(e) => setForm((f) => ({ ...f, deviceHash: e.target.value }))}
                placeholder="sha256…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loginHour">Login hour (0–23)</Label>
              <Input
                id="loginHour"
                type="number"
                min={0}
                max={23}
                value={form.loginHour}
                onChange={(e) => setForm((f) => ({ ...f, loginHour: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={scoreMutation.isPending} className="w-full">
                {scoreMutation.isPending ? "Scoring…" : "Score login"}
              </Button>
            </div>
          </form>

          {scoreMutation.error && (
            <p className="mt-3 text-sm text-destructive">{scoreMutation.error.message}</p>
          )}

          {signals && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Overall risk</span>
                <Badge variant={riskBand(signals.overallScore).variant}>
                  {riskBand(signals.overallScore).label} · {(signals.overallScore * 100).toFixed(0)}
                  %
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {signals.flags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No deviating signals — consistent with the user&apos;s baseline.
                  </span>
                ) : (
                  signals.flags.map((flag) => (
                    <Badge key={flag} variant="outline">
                      {flag.replace(/_/g, " ")}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Baselines table */}
      <Card>
        <CardHeader>
          <CardTitle>Behavior baselines</CardTitle>
          <CardDescription>
            {baselines.length} user{baselines.length === 1 ? "" : "s"} with a learned profile.
            Resetting clears the learned IPs, devices, and timing for that user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServerStateStatus
            isFetching={baselinesQuery.isFetching && !baselinesQuery.isPending}
            isStale={baselinesQuery.isStale}
            hasData={hasBaselines}
            label="baselines"
            onRefresh={() => void baselinesQuery.refetch()}
          />

          {baselinesQuery.error && !hasBaselines ? (
            <ErrorState
              message={baselinesQuery.error.message}
              retry={() => void baselinesQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Logins</TableHead>
                    <TableHead className="text-right">Known IPs</TableHead>
                    <TableHead>Countries</TableHead>
                    <TableHead className="text-right">Devices</TableHead>
                    <TableHead className="text-right">Avg hour</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baselinesQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {!baselinesQuery.isPending && baselines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No baselines yet. They form automatically as users sign in.
                      </TableCell>
                    </TableRow>
                  )}
                  {!baselinesQuery.isPending &&
                    baselines.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.userId}</TableCell>
                        <TableCell className="text-right">{b.totalLogins ?? 0}</TableCell>
                        <TableCell className="text-right">{b.knownIps?.length ?? 0}</TableCell>
                        <TableCell>
                          {b.knownCountries && b.knownCountries.length > 0
                            ? b.knownCountries.slice(0, 4).join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">{b.knownDevices?.length ?? 0}</TableCell>
                        <TableCell className="text-right">
                          {b.loginHourStats ? b.loginHourStats.mean.toFixed(0) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(b.lastUpdatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                              resetMutation.isPending && resetMutation.variables === b.userId
                            }
                            onClick={() => void handleReset(b.userId)}
                          >
                            {resetMutation.isPending && resetMutation.variables === b.userId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Reset
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
