"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { type AuditEntry, auditEntriesFromResponse } from "./auditData";

interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ data: AuditEntry[]; pagination: any } | AuditEntry[]>(
          "/admin/audit-logs"
        );
        setEntries(auditEntriesFromResponse(data));
        setLoadError(null);
      } catch {
        setEntries([]);
        setLoadError("Failed to load audit entries.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function runVerify() {
    setVerifying(true);
    setVerify(null);
    try {
      const res = await api.get<VerifyResult>("/admin/audit-logs/verify");
      setVerify(res);
    } catch {
      setVerify({
        ok: false,
        checked: 0,
        brokenAt: { seq: 0, id: "", reason: "verify request failed" },
      });
    } finally {
      setVerifying(false);
    }
  }

  function getStatus(entry: AuditEntry): string {
    if (entry.success === false) return "failure";
    if (entry.success === true) return "success";
    return entry.status ?? "success";
  }

  function getTimestamp(entry: AuditEntry): string {
    const raw = entry.timestamp ?? entry.createdAt;
    if (!raw) return "—";
    return new Date(raw).toLocaleString();
  }

  function getUser(entry: AuditEntry): string {
    return entry.actorEmail ?? entry.userEmail ?? entry.user ?? entry.userId ?? "—";
  }

  function getIp(entry: AuditEntry): string {
    return entry.ip ?? entry.ipAddress ?? "—";
  }

  function getDetail(entry: AuditEntry): Record<string, unknown> {
    return entry.metadata ?? entry.details ?? entry.resourceDetails ?? {};
  }

  function statusBadge(status: string) {
    const failed = status === "failure" || status === "error";
    return <Badge variant={failed ? "destructive" : "success"}>{status}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent authentication and admin events
          </p>
        </div>
        <Button type="button" variant="outline" onClick={runVerify} disabled={verifying}>
          {verifying ? "Verifying…" : "Verify integrity"}
        </Button>
      </div>

      {verify && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            verify.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {verify.ok ? (
            <>
              ✓ Hash chain intact — verified {verify.checked} chained{" "}
              {verify.checked === 1 ? "entry" : "entries"}.
            </>
          ) : (
            <>
              ✗ Tamper detected after checking {verify.checked} entries
              {verify.brokenAt?.seq ? ` — broke at seq ${verify.brokenAt.seq}` : ""}
              {verify.brokenAt?.reason ? ` (${verify.brokenAt.reason})` : ""}.
            </>
          )}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
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
                {!loading && entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No audit entries found.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      onClick={() => setSelected(entry)}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {getTimestamp(entry)}
                      </TableCell>
                      <TableCell className="text-foreground">{getUser(entry)}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary">
                          {entry.action}
                        </code>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {getIp(entry)}
                      </TableCell>
                      <TableCell>{statusBadge(getStatus(entry))}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit log detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Timestamp</p>
                  <p className="text-foreground">{getTimestamp(selected)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">User</p>
                  <p className="text-foreground">{getUser(selected)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Action</p>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary">
                    {selected.action}
                  </code>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">IP Address</p>
                  <p className="font-mono text-xs text-foreground">{getIp(selected)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Status</p>
                  {statusBadge(getStatus(selected))}
                </div>
              </div>
              {Object.keys(getDetail(selected)).length > 0 && (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Details</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground/80">
                    {JSON.stringify(getDetail(selected), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
