"use client";

import { useMemo, useState } from "react";
import AreaTrendChart from "@/components/admin/AreaTrendChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useAuditEntriesQuery, useAuditVerifyQuery } from "@/lib/server-state/audit";
import type { AuditEntry } from "@/lib/server-state/types";
import { auditEntriesFromResponse, auditVolumeByDay } from "./auditData";
import {
  AuditStatusBadge,
  createAuditColumns,
  getAuditDetail,
  getAuditIp,
  getAuditTimestamp,
  getAuditUser,
} from "./columns";

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
  const columns = createAuditColumns(setSelected);

  async function runVerify() {
    await verifyQuery.refetch();
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
              ✕ Tamper detected after checking {verify.checked} entries
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
          <DataTable
            columns={columns}
            data={entries}
            isLoading={loading}
            emptyMessage="No audit entries found."
            search={{ placeholder: "Search audit logs" }}
            tableLabel="Audit logs"
          />
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
                  <p className="text-foreground">{getAuditTimestamp(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">User</p>
                  <p className="text-foreground">{getAuditUser(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Action</p>
                  <code className="rounded bg-muted px-2 py-1 text-xs text-primary">
                    {selected.action}
                  </code>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">IP Address</p>
                  <p className="font-mono text-xs text-foreground">{getAuditIp(selected)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Status</p>
                  <AuditStatusBadge entry={selected} />
                </div>
              </div>
              {Object.keys(getAuditDetail(selected)).length > 0 && (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Details</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground/80">
                    {JSON.stringify(getAuditDetail(selected), null, 2)}
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
