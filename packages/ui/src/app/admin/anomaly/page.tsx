"use client";

import { Activity, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { riskBand } from "@/lib/anomaly";
import { api } from "@/lib/api";

interface RollingStats {
  mean: number;
  variance: number;
  count: number;
}

interface Baseline {
  id: string;
  userId: string;
  loginHourStats?: RollingStats;
  sessionDurationStats?: RollingStats;
  knownIps?: string[];
  knownCountries?: string[];
  knownDevices?: string[];
  totalLogins?: number;
  lastUpdatedAt?: string;
  createdAt?: string;
}

interface AnomalySignals {
  unknownIp: boolean;
  unknownCountry: boolean;
  unknownDevice: boolean;
  unusualHour: boolean;
  overallScore: number;
  flags: string[];
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export default function AnomalyPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Risk-scoring panel state
  const [form, setForm] = useState({
    userId: "",
    ip: "",
    country: "",
    deviceHash: "",
    loginHour: String(new Date().getHours()),
  });
  const [scoring, setScoring] = useState(false);
  const [signals, setSignals] = useState<AnomalySignals | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ baselines: Baseline[] }>("/admin/anomaly/baselines?limit=100");
      setBaselines(data.baselines ?? []);
    } catch {
      showToast("Failed to load behavior baselines");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReset(userId: string) {
    try {
      await api.delete(`/admin/anomaly/baseline/${userId}`);
      setBaselines((prev) => prev.filter((b) => b.userId !== userId));
      showToast("Baseline reset");
    } catch {
      showToast("Failed to reset baseline");
    }
  }

  async function handleScore(e: React.FormEvent) {
    e.preventDefault();
    setScoreError(null);
    setSignals(null);
    setScoring(true);
    try {
      const result = await api.post<AnomalySignals>("/admin/anomaly/score", {
        userId: form.userId.trim(),
        ip: form.ip.trim(),
        country: form.country.trim() || null,
        deviceHash: form.deviceHash.trim(),
        loginHour: Number(form.loginHour),
      });
      setSignals(result);
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Scoring failed");
    } finally {
      setScoring(false);
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
              <Button type="submit" disabled={scoring} className="w-full">
                {scoring ? "Scoring…" : "Score login"}
              </Button>
            </div>
          </form>

          {scoreError && <p className="mt-3 text-sm text-destructive">{scoreError}</p>}

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
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && baselines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No baselines yet. They form automatically as users sign in.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
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
                          onClick={() => handleReset(b.userId)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
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
