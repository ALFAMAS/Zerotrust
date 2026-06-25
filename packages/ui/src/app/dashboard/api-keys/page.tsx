"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
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

  const load = useCallback(() => {
    api
      .get<ApiKey[]>("/api-keys")
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      <p className="mb-8 text-sm text-muted-foreground">
        Use API keys to authenticate programmatic access to your account.
      </p>

      {newKey && (
        <div className="mb-6 rounded-xl border border-emerald-700 bg-emerald-900/30 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-300">
            API key created — copy it now, you won&apos;t see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-background p-2 font-mono text-xs text-emerald-300">
              {newKey}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={() => copy(newKey)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0 text-xs text-muted-foreground"
            onClick={() => setNewKey(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Create new key</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Key name (e.g. CI/CD pipeline)"
                className="flex-1"
              />
              <Select
                value={form.environment}
                onValueChange={(v) => setForm((f) => ({ ...f, environment: v }))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="test">Test</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={form.expiresInDays || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, expiresInDays: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No expiry</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Test keys are prefixed <span className="font-mono">zak_test_</span> and meant for
              sandbox/non-production use.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={creating} className="self-start">
              {creating ? "Creating…" : "Create key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No active API keys. Create one above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {key.name}
                      {key.environment === "test" && <Badge variant="warning">Test</Badge>}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}…
                    </p>
                    {key.lastUsedAt ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last used {new Date(key.lastUsedAt).toLocaleString()}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">Never used</p>
                    )}
                    {key.expiresAt && (
                      <p className="mt-0.5 text-xs text-amber-600">
                        Expires {new Date(key.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(key.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
