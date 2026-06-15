"use client";

import { useEffect, useState } from "react";
import { Loader2, Network, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

interface FederatedProvider {
  id: string;
  name: string;
  issuerUrl: string;
  jwksUri?: string;
  trustedTenantId?: string;
  enabled: boolean;
  createdAt: string;
}

export default function AdminFederationPage() {
  const [providers, setProviders] = useState<FederatedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    issuerUrl: "",
    jwksUri: "",
    trustedTenantId: "",
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    try {
      const data = await api.get<{ providers: FederatedProvider[] }>("/federation/providers");
      setProviders(data.providers ?? []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/federation/providers", {
        id: form.id.trim(),
        name: form.name.trim(),
        issuerUrl: form.issuerUrl.trim(),
        jwksUri: form.jwksUri.trim() || undefined,
        trustedTenantId: form.trustedTenantId.trim() || undefined,
        enabled: true,
      });
      showToast("Provider registered");
      setForm({ id: "", name: "", issuerUrl: "", jwksUri: "", trustedTenantId: "" });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register provider");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.delete(`/federation/providers/${id}`);
      showToast("Provider removed");
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } catch {
      showToast("Failed to remove provider");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Identity federation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trusted external identity providers for RFC 8693 token exchange. A subject token from a
            registered provider can be exchanged for a ZeroAuth access token at{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/federation/token-exchange</code>.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add provider
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Provider ID</label>
              <input
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="partner-idp"
                required
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Display name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Partner IdP"
                required
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Issuer URL</label>
            <input
              value={form.issuerUrl}
              onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
              placeholder="https://idp.partner.com"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">JWKS URI (optional)</label>
              <input
                value={form.jwksUri}
                onChange={(e) => setForm({ ...form, jwksUri: e.target.value })}
                placeholder="https://idp.partner.com/.well-known/jwks.json"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Trusted tenant (optional)</label>
              <input
                value={form.trustedTenantId}
                onChange={(e) => setForm({ ...form, trustedTenantId: e.target.value })}
                placeholder="acme-corp"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Register
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Network className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No federated providers registered yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {providers.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      p.enabled
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{p.issuerUrl}</p>
                {p.trustedTenantId && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Trusted tenant: {p.trustedTenantId}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deleting === p.id}
                aria-label={`Remove ${p.name}`}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-red-700 hover:text-red-400 disabled:opacity-50"
              >
                {deleting === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
