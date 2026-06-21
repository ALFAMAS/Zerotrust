"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

interface ApiKey {
  id: string;
  name: string;
  environment?: "live" | "test";
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", expiresInDays: "", environment: "live" });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () =>
    api
      .get<ApiKey[]>("/api-keys")
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required");
    setError("");
    setCreating(true);
    try {
      const body: any = { name: form.name.trim(), environment: form.environment };
      if (form.expiresInDays) body.expiresInDays = parseInt(form.expiresInDays, 10);
      const res = await api.post<any>("/api-keys", body);
      setNewKey(res.key);
      setForm({ name: "", expiresInDays: "", environment: form.environment });
      load();
    } catch {
      setError("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await api.delete(`/api-keys/${id}`).catch(() => {});
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">
        API Keys
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Use API keys to authenticate programmatic access to your account.
      </p>

      {newKey && (
        <div className="mb-6 bg-green-900/30 border border-green-700 rounded-xl p-4">
          <p className="text-green-300 text-sm font-semibold mb-2">
            API key created — copy it now, you won't see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background text-green-300 text-xs p-2 rounded-lg font-mono break-all">
              {newKey}
            </code>
            <button
              onClick={() => copy(newKey)}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground/80"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-foreground mb-4">Create new key</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Key name (e.g. CI/CD pipeline)"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
            />
            <select
              value={form.environment}
              onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
            >
              <option value="live">Live</option>
              <option value="test">Test</option>
            </select>
            <select
              value={form.expiresInDays}
              onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-ring"
            >
              <option value="">No expiry</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <p className="text-muted-foreground text-xs">
            Test keys are prefixed <span className="font-mono">zak_test_</span> and meant for
            sandbox/non-production use.
          </p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="self-start px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-colors"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Active keys</h2>
        </div>
        {loading ? (
          <div className="p-6 text-muted-foreground text-sm">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            No active API keys. Create one above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-foreground text-sm font-medium flex items-center gap-2">
                    {key.name}
                    {key.environment === "test" && (
                      <span className="rounded bg-yellow-900/40 text-yellow-400 text-[10px] font-semibold uppercase px-1.5 py-0.5 tracking-wide">
                        Test
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5 font-mono">{key.keyPrefix}…</p>
                  {key.lastUsedAt ? (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Last used {new Date(key.lastUsedAt).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs mt-0.5">Never used</p>
                  )}
                  {key.expiresAt && (
                    <p className="text-yellow-600 text-xs mt-0.5">
                      Expires {new Date(key.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
