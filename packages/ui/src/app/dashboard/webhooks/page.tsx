"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import Modal from "../../../components/Modal";
import EmptyState from "../../../components/EmptyState";

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempt: number;
  responseStatus: number | null;
  error: string | null;
  recordedAt: string;
}

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
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ url: "", secret: "", events: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, string>>({});
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);

  const load = useCallback(() => {
    api
      .get<WebhookEndpoint[]>("/webhooks")
      .then(setEndpoints)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createEndpoint() {
    setError(null);
    try {
      await api.post("/webhooks", form);
      setCreateOpen(false);
      setForm({ url: "", secret: "", events: [] });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    try {
      await api.delete(`/webhooks/${id}`);
      load();
    } catch {
      alert("Failed to delete endpoint");
    }
  }

  async function pingEndpoint(id: string) {
    setPingResult((r) => ({ ...r, [id]: "…" }));
    try {
      await api.post(`/webhooks/${id}/ping`, {});
      setPingResult((r) => ({ ...r, [id]: "✓ delivered" }));
    } catch {
      setPingResult((r) => ({ ...r, [id]: "✗ failed" }));
    }
  }

  async function openDeliveries(id: string) {
    setDeliveriesFor(id);
    setDeliveries(null);
    try {
      const res = await api.get<{ deliveries: WebhookDelivery[] }>(`/webhooks/${id}/deliveries`);
      setDeliveries(res.deliveries);
    } catch {
      setDeliveries([]);
    }
  }

  async function toggleActive(ep: WebhookEndpoint) {
    try {
      await api.patch(`/webhooks/${ep.id}`, { active: !ep.active });
      load();
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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">Webhooks</h1>
          <p className="text-muted-foreground text-sm">
            Receive signed HTTP callbacks when events happen in your account. Payloads are signed
            with HMAC-SHA256 in the <code className="text-primary">X-ZeroAuth-Signature</code>{" "}
            header.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 px-4 py-2 bg-primary hover:bg-primary/90 text-foreground text-sm font-medium rounded-lg transition-colors"
        >
          Add endpoint
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon="🪝"
            title="No webhook endpoints yet"
            description="Add an endpoint to receive real-time events like logins, user changes and anomaly alerts."
            actionLabel="Add your first endpoint"
            onAction={() => setCreateOpen(true)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div
              key={ep.id}
              className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{ep.url}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ep.events.length} event{ep.events.length === 1 ? "" : "s"} ·{" "}
                  <span className={ep.active ? "text-green-400" : "text-muted-foreground"}>
                    {ep.active ? "Active" : "Disabled"}
                  </span>
                  {pingResult[ep.id] && (
                    <span className="ml-2 text-muted-foreground">{pingResult[ep.id]}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => pingEndpoint(ep.id)}
                  className="px-3 py-1.5 bg-muted hover:bg-accent text-foreground/80 text-xs rounded-lg transition-colors"
                >
                  Test
                </button>
                <button
                  onClick={() => openDeliveries(ep.id)}
                  className="px-3 py-1.5 bg-muted hover:bg-accent text-foreground/80 text-xs rounded-lg transition-colors"
                >
                  Deliveries
                </button>
                <button
                  onClick={() => toggleActive(ep)}
                  className="px-3 py-1.5 bg-muted hover:bg-accent text-foreground/80 text-xs rounded-lg transition-colors"
                >
                  {ep.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteEndpoint(ep.id)}
                  className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 text-xs rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <Modal title="Add webhook endpoint" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-foreground/80 mb-1.5">Endpoint URL</label>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/webhooks/zeroauth"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-sm text-foreground/80 mb-1.5">Signing secret</label>
              <input
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="whsec_…"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used to sign each payload — verify it on your server.
              </p>
            </div>
            <div>
              <label className="block text-sm text-foreground/80 mb-1.5">Events</label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs text-foreground/80">
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded border-border bg-muted"
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={createEndpoint}
              disabled={!form.url || !form.secret || form.events.length === 0}
              className="w-full py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition-colors"
            >
              Create endpoint
            </button>
          </div>
        </Modal>
      )}

      {deliveriesFor && (
        <Modal
          title="Recent deliveries"
          onClose={() => {
            setDeliveriesFor(null);
            setDeliveries(null);
          }}
        >
          {deliveries === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deliveries recorded yet. Send a test ping or trigger an event.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1.5 pr-3">Event</th>
                    <th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">Try</th>
                    <th className="py-1.5 pr-3">HTTP</th>
                    <th className="py-1.5">When</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-border align-top">
                      <td className="py-1.5 pr-3 font-mono">{d.event}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={
                            d.status === "delivered" ? "text-green-400" : "text-red-400"
                          }
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">#{d.attempt}</td>
                      <td className="py-1.5 pr-3">{d.responseStatus ?? d.error ?? "—"}</td>
                      <td className="py-1.5 whitespace-nowrap">
                        {new Date(d.recordedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
