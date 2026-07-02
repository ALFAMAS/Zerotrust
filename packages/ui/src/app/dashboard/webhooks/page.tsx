"use client";

import { useState } from "react";
import EmptyState from "@/components/EmptyState";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WebhookEndpoint } from "@/lib/server-state/types";
import {
  useCreateWebhookEndpointMutation,
  useDeleteWebhookEndpointMutation,
  usePingWebhookEndpointMutation,
  useToggleWebhookEndpointMutation,
  useWebhookDeliveriesQuery,
  useWebhookEndpointsQuery,
} from "@/lib/server-state/webhooks";

const EVENT_OPTIONS = [
  "auth.login.success",
  "auth.login.failed",
  "user.created",
  "user.updated",
  "user.deleted",
  "session.revoked",
  "mfa.enabled",
  "anomaly.detected",
];

export default function WebhooksPage() {
  const endpointsQuery = useWebhookEndpointsQuery();
  const createMutation = useCreateWebhookEndpointMutation();
  const deleteMutation = useDeleteWebhookEndpointMutation();
  const pingMutation = usePingWebhookEndpointMutation();
  const toggleMutation = useToggleWebhookEndpointMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    url: "",
    secret: "",
    events: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, string>>({});
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const deliveriesQuery = useWebhookDeliveriesQuery(deliveriesFor, { limit: 50 });

  const endpoints = endpointsQuery.data ?? [];
  const hasEndpoints = endpoints.length > 0;
  const deliveries = deliveriesQuery.data?.deliveries ?? [];

  async function createEndpoint() {
    setError(null);
    try {
      await createMutation.mutateAsync(form);
      setCreateOpen(false);
      setForm({ url: "", secret: "", events: [] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch {
      alert("Failed to delete endpoint");
    }
  }

  async function pingEndpoint(id: string) {
    setPingResult((r) => ({ ...r, [id]: "…" }));
    try {
      await pingMutation.mutateAsync(id);
      setPingResult((r) => ({ ...r, [id]: "✓ delivered" }));
    } catch {
      setPingResult((r) => ({ ...r, [id]: "✗ failed" }));
    }
  }

  function openDeliveries(id: string) {
    setDeliveriesFor(id);
  }

  async function toggleActive(ep: WebhookEndpoint) {
    try {
      await toggleMutation.mutateAsync({ id: ep.id, active: !ep.active });
    } catch {
      alert("Failed to update endpoint");
    }
  }

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            Webhooks
          </h1>
          <p className="text-sm text-muted-foreground">
            Receive signed HTTP callbacks when events happen in your account. Payloads are signed
            with HMAC-SHA256 in the <code className="text-primary">X-zerotrust-Signature</code>{" "}
            header.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
          Add endpoint
        </Button>
      </div>

      <ServerStateStatus
        isFetching={endpointsQuery.isFetching && !endpointsQuery.isPending}
        isStale={endpointsQuery.isStale}
        hasData={hasEndpoints}
        label="webhooks"
        onRefresh={() => void endpointsQuery.refetch()}
      />

      {endpointsQuery.error && !hasEndpoints ? (
        <ErrorState
          message={endpointsQuery.error.message}
          retry={() => void endpointsQuery.refetch()}
        />
      ) : endpointsQuery.isPending ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
          <p className="sr-only">Loading webhooks…</p>
        </div>
      ) : endpoints.length === 0 ? (
        <Card>
          <EmptyState
            icon="🪝"
            title="No webhook endpoints yet"
            description="Add an endpoint to receive real-time events like logins, user changes and anomaly alerts."
            actionLabel="Add your first endpoint"
            onAction={() => setCreateOpen(true)}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <Card key={ep.id} className="flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{ep.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ep.events.length} event{ep.events.length === 1 ? "" : "s"} ·{" "}
                  <span className={ep.active ? "text-emerald-500" : "text-muted-foreground"}>
                    {ep.active ? "Active" : "Disabled"}
                  </span>
                  {pingResult[ep.id] && (
                    <span className="ml-2 text-muted-foreground">{pingResult[ep.id]}</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => pingEndpoint(ep.id)}
                  disabled={pingMutation.isPending}
                >
                  Test
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openDeliveries(ep.id)}
                >
                  Deliveries
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleActive(ep)}
                  disabled={toggleMutation.isPending}
                >
                  {ep.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteEndpoint(ep.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>
              We&apos;ll POST signed event payloads to this URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/webhooks/zerotrust"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">Signing secret</Label>
              <Input
                id="wh-secret"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="whsec_…"
              />
              <p className="text-xs text-muted-foreground">
                Used to sign each payload — verify it on your server.
              </p>
            </div>
            <div>
              <span className="mb-1.5 block text-sm text-foreground/80">Events</span>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((ev) => (
                  <div key={ev} className="flex items-center gap-2 text-xs text-foreground/80">
                    <Checkbox
                      id={`wh-event-${ev}`}
                      checked={form.events.includes(ev)}
                      onCheckedChange={() => toggleEvent(ev)}
                    />
                    <Label
                      htmlFor={`wh-event-${ev}`}
                      className="cursor-pointer text-xs font-normal"
                    >
                      {ev}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="button"
              className="w-full"
              onClick={createEndpoint}
              disabled={
                !form.url || !form.secret || form.events.length === 0 || createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating…" : "Create endpoint"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deliveriesFor !== null}
        onOpenChange={(open) => {
          if (!open) setDeliveriesFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recent deliveries</DialogTitle>
            <DialogDescription>
              Recent delivery attempts for this webhook endpoint.
            </DialogDescription>
          </DialogHeader>
          {deliveriesQuery.isPending || deliveriesQuery.isFetching ? (
            <p className="text-sm text-muted-foreground">Loading deliveries…</p>
          ) : deliveriesQuery.error ? (
            <ErrorState
              message={deliveriesQuery.error.message}
              retry={() => void deliveriesQuery.refetch()}
            />
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deliveries recorded yet. Send a test ping or trigger an event.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Try</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.event}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "delivered" ? "success" : "destructive"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>#{d.attempt}</TableCell>
                      <TableCell>{d.responseStatus ?? d.error ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(d.recordedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
