"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

interface ApiKey {
  id: string;
  name: string;
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
  const [form, setForm] = useState({ name: "", expiresInDays: "" });
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
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required");
    setError("");
    setCreating(true);
    try {
      const body: any = { name: form.name.trim() };
      if (form.expiresInDays) body.expiresInDays = parseInt(form.expiresInDays);
      const res = await api.post<any>("/api-keys", body);
      setNewKey(res.key);
      setForm({ name: "", expiresInDays: "" });
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
      <h1 className="text-2xl font-bold text-white mb-1">API Keys</h1>
      <p className="text-gray-400 text-sm mb-8">
        Use API keys to authenticate programmatic access to your account.
      </p>

      {newKey && (
        <div className="mb-6 bg-green-900/30 border border-green-700 rounded-xl p-4">
          <p className="text-green-300 text-sm font-semibold mb-2">
            API key created — copy it now, you won't see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-950 text-green-300 text-xs p-2 rounded-lg font-mono break-all">
              {newKey}
            </code>
            <button
              onClick={() => copy(newKey)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Create new key</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Key name (e.g. CI/CD pipeline)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <select
              value={form.expiresInDays}
              onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">No expiry</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="self-start px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Active keys</h2>
        </div>
        {loading ? (
          <div className="p-6 text-gray-500 text-sm">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-6 text-gray-500 text-sm">No active API keys. Create one above.</div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-white text-sm font-medium">{key.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5 font-mono">{key.keyPrefix}…</p>
                  {key.lastUsedAt ? (
                    <p className="text-gray-600 text-xs mt-0.5">
                      Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-gray-600 text-xs mt-0.5">Never used</p>
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
