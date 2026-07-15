"use client";

import { useMemo, useState } from "react";
import AreaTrendChart from "@/components/admin/AreaTrendChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditEntriesQuery, useAuditVerifyQuery } from "@/lib/server-state/audit";
import type { AuditEntry } from "@/lib/server-state/types";
import { auditEntriesFromResponse, auditVolumeByDay } from "./auditData";

export default function AuditClient() {
  const entriesQuery = useAuditEntriesQuery();
  const verifyQuery = useAuditVerifyQuery();
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const entries = entriesQuery.data ? auditEntriesFromResponse(entriesQuery.data) : [];
  const volumeByDay = useMemo(
    () =>
      auditVolumeByDay(entries).map((row) => ({
        date: row.date,
        value: row.count,
      })),
    [entries]
  );
  const hasVolume = volumeByDay.some((row) => row.value > 0);
  const verify = verifyQuery.data ?? null;
  const loading = entriesQuery.isPending;
  const verifying = verifyQuery.isFetching;
  const loadError = entriesQuery.error ? "Failed to load audit entries." : null;

  async function runVerify() {
    await verifyQuery.refetch();
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
          <PageHeader
            title={<>Audit Logs</>}
            description={<>Recent authentication and admin events</>}
          />
        </div>
        <Button type="button" variant="outline" onClick={runVerify} disabled={verifying}>
          {verifying ? "Verifying…" : "Verify integrity"}
        </Button>
      </div>

      {verify && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            verify.ok
              ? "border-success bg-success/10 text-success-subtle-foreground dark:text-success-subtle-foreground"
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

      {!loadError && entries.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-1 font-medium text-foreground">Event volume (14 days)</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Daily count from loaded audit entries
              {!hasVolume ? " — no events in this window yet" : ""}
            </p>
            <AreaTrendChart loading={loading} points={volumeByDay} seriesLabel="Events" />
          </CardContent>
        </Card>
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
                        <code className="rounded bg-muted px-2 py-1 text-xs text-primary">
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
                  <p className="mb-1 text-xs text-muted-foreground">Timestamp</p>
                  <p className="text-foreground">{getTimestamp(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">User</p>
                  <p className="text-foreground">{getUser(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Action</p>
                  <code className="rounded bg-muted px-2 py-1 text-xs text-primary">
                    {selected.action}
                  </code>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">IP Address</p>
                  <p className="font-mono text-xs text-foreground">{getIp(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Status</p>
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
