"use client";

import { Webhook } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminWebhookDeliveriesQuery } from "@/lib/server-state/adminWebhooks";

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  delivered: "success",
  failed: "destructive",
  retrying: "warning",
  pending: "secondary",
};

export default function AdminWebhookDeliveriesPage() {
  const [webhookId, setWebhookId] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const deliveriesQuery = useAdminWebhookDeliveriesQuery(submittedId, { limit: 50 });
  const deliveries = deliveriesQuery.data?.data ?? [];

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedId(webhookId.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Webhook className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Webhook delivery log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin-wide delivery attempts for any webhook endpoint (cross-tenant).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lookup deliveries</CardTitle>
          <CardDescription>
            Enter a webhook endpoint ID to view its delivery history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="webhookId">Webhook ID</Label>
              <Input
                id="webhookId"
                value={webhookId}
                onChange={(e) => setWebhookId(e.target.value)}
                placeholder="uuid"
                required
              />
            </div>
            <Button type="submit">Load deliveries</Button>
          </form>
        </CardContent>
      </Card>

      {submittedId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Deliveries for {submittedId.slice(0, 8)}…</CardTitle>
              <CardDescription>
                {deliveriesQuery.data?.pagination?.total ?? 0} attempts
              </CardDescription>
            </div>
            <ServerStateStatus query={deliveriesQuery} />
          </CardHeader>
          <CardContent>
            {deliveriesQuery.error ? (
              <ErrorState
                message={deliveriesQuery.error.message}
                retry={() => deliveriesQuery.refetch()}
              />
            ) : deliveriesQuery.isPending ? (
              <SkeletonList count={5} />
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.event}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status] ?? "secondary"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>{d.attempt}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.responseStatus ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(d.recordedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
