"use client";

import { Bot, Copy, KeyRound, Loader2, Ticket, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_ZEROAUTH_URL ?? "http://localhost:3000";

interface CreatedCredential {
  id: string;
  workloadId: string;
  secret: string;
  scopes: string[];
  expiresAt: string;
}

interface WorkloadCredential {
  id: string;
  workloadId: string;
  scopes: string[];
  ttl: number | null;
  expiresAt: string | null;
  isRevoked: boolean;
  createdAt: string;
  status: "active" | "expired" | "revoked";
}

const CRED_STATUS_STYLES: Record<WorkloadCredential["status"], string> = {
  active: "border-green-500/30 bg-green-500/10 text-green-400",
  expired: "border-border bg-muted text-muted-foreground",
  revoked: "border-red-500/30 bg-red-500/10 text-red-400",
};

interface IssuedToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  principalType: string;
  workloadId: string;
  scopes: string[];
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AdminWorkloadPage() {
  // Issue
  const [issueKey, setIssueKey] = useState("");
  const [issueForm, setIssueForm] = useState({ workloadId: "", scopes: "", ttlSeconds: 3600 });
  const [issuing, setIssuing] = useState(false);
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Mint token
  const [tokenForm, setTokenForm] = useState({ workloadId: "", secret: "", scopes: "" });
  const [minting, setMinting] = useState(false);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Issued credentials list
  const [credentials, setCredentials] = useState<WorkloadCredential[]>([]);
  const [credsLoading, setCredsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function loadCredentials() {
    try {
      const data = await api.get<{ credentials: WorkloadCredential[] }>("/workload/credentials");
      setCredentials(data.credentials ?? []);
    } catch {
      setCredentials([]);
    } finally {
      setCredsLoading(false);
    }
  }

  useEffect(() => {
    loadCredentials();
    // biome-ignore lint/correctness/useExhaustiveDependencies: loads on mount / when the route key changes; closes over stable setters
  }, [loadCredentials]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await api.post(`/workload/credentials/${id}/revoke`);
      setCredentials((prev) =>
        prev.map((cred) =>
          cred.id === id ? { ...cred, isRevoked: true, status: "revoked" } : cred
        )
      );
    } catch {
      // leave row unchanged on failure
    } finally {
      setRevoking(null);
    }
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssuing(true);
    setIssueError(null);
    setCreated(null);
    try {
      const res = await fetch(`${API}/workload/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workload-key": issueKey.trim() },
        body: JSON.stringify({
          workloadId: issueForm.workloadId.trim(),
          scopes: issueForm.scopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ttl: Math.max(60, Number(issueForm.ttlSeconds) || 3600),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssueError(
          res.status === 403
            ? "Forbidden — the workload issue key is missing or incorrect."
            : (data.error ?? "Failed to issue credential")
        );
        return;
      }
      setCreated(data.created as CreatedCredential);
      setIssueForm({ workloadId: "", scopes: "", ttlSeconds: 3600 });
      loadCredentials();
    } catch {
      setIssueError("Network error. Is the API reachable?");
    } finally {
      setIssuing(false);
    }
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    setMinting(true);
    setTokenError(null);
    setToken(null);
    try {
      const data = await api.post<IssuedToken>("/workload/token", {
        workloadId: tokenForm.workloadId.trim(),
        secret: tokenForm.secret.trim(),
        scopes: tokenForm.scopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setToken(data);
    } catch (err: unknown) {
      setTokenError(err instanceof Error ? err.message : "Failed to mint token");
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Workload &amp; agent identity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Issue scoped, short-lived credentials to services and AI agents, then exchange them for
          access tokens via client-credentials. Workload tokens carry a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">principal_type: agent</code> claim
          to distinguish them from human users.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Issue credential */}
        <form
          onSubmit={handleIssue}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Issue a credential</h2>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f0" className="text-sm font-medium text-foreground">
              Workload issue key
            </label>
            <input
              id="page-f0"
              type="password"
              value={issueKey}
              onChange={(e) => setIssueKey(e.target.value)}
              placeholder="WORKLOAD_ISSUE_KEY"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">
              Sent as the <code className="rounded bg-muted px-1">x-workload-key</code> header. Set{" "}
              <code className="rounded bg-muted px-1">WORKLOAD_ISSUE_KEY</code> in the API env.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f1" className="text-sm font-medium text-foreground">
              Workload ID
            </label>
            <input
              id="page-f1"
              value={issueForm.workloadId}
              onChange={(e) => setIssueForm({ ...issueForm, workloadId: e.target.value })}
              placeholder="billing-sync-job"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f2" className="text-sm font-medium text-foreground">
              Scopes
            </label>
            <input
              id="page-f2"
              value={issueForm.scopes}
              onChange={(e) => setIssueForm({ ...issueForm, scopes: e.target.value })}
              placeholder="users:read, billing:write"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f3" className="text-sm font-medium text-foreground">
              TTL (seconds)
            </label>
            <input
              id="page-f3"
              type="number"
              min={60}
              value={issueForm.ttlSeconds}
              onChange={(e) =>
                setIssueForm({ ...issueForm, ttlSeconds: Number(e.target.value) || 3600 })
              }
              className="w-32 rounded-lg border border-border bg-muted px-3 py-2 text-right text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={issuing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {issuing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Issue credential
          </button>

          {issueError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {issueError}
            </div>
          )}

          {created && (
            <div className="space-y-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <p className="text-xs font-medium text-green-400">
                Credential created — copy the secret now, it won&apos;t be shown again.
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="break-all font-mono text-xs text-foreground">
                  {created.secret}
                </span>
                <CopyButton value={created.secret} />
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(created.expiresAt).toLocaleString()}
              </p>
            </div>
          )}
        </form>

        {/* Mint token */}
        <form
          onSubmit={handleMint}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Mint an agent token</h2>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f4" className="text-sm font-medium text-foreground">
              Workload ID
            </label>
            <input
              id="page-f4"
              value={tokenForm.workloadId}
              onChange={(e) => setTokenForm({ ...tokenForm, workloadId: e.target.value })}
              placeholder="billing-sync-job"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f5" className="text-sm font-medium text-foreground">
              Secret
            </label>
            <input
              id="page-f5"
              type="password"
              value={tokenForm.secret}
              onChange={(e) => setTokenForm({ ...tokenForm, secret: e.target.value })}
              placeholder="workload secret"
              required
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="page-f6" className="text-sm font-medium text-foreground">
              Scopes (optional subset)
            </label>
            <input
              id="page-f6"
              value={tokenForm.scopes}
              onChange={(e) => setTokenForm({ ...tokenForm, scopes: e.target.value })}
              placeholder="leave blank for all granted scopes"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={minting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Mint token
          </button>

          {tokenError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {tokenError}
            </div>
          )}

          {token && (
            <div className="space-y-2 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {token.tokenType} · expires in {token.expiresIn}s · {token.principalType}
                </span>
                <CopyButton value={token.accessToken} />
              </div>
              <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs text-foreground break-all whitespace-pre-wrap">
                {token.accessToken}
              </pre>
              {token.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {token.scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Issued credentials */}
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">Issued credentials</h2>
        {credsLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : credentials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No workload credentials issued yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {credentials.map((cred) => (
              <li
                key={cred.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{cred.workloadId}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${CRED_STATUS_STYLES[cred.status]}`}
                    >
                      {cred.status}
                    </span>
                  </div>
                  {cred.scopes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cred.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(cred.createdAt).toLocaleString()}
                    {cred.expiresAt && ` · expires ${new Date(cred.expiresAt).toLocaleString()}`}
                  </p>
                </div>
                {cred.status !== "revoked" && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(cred.id)}
                    disabled={revoking === cred.id}
                    className="flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-red-700 hover:text-red-400 disabled:opacity-50"
                  >
                    {revoking === cred.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
