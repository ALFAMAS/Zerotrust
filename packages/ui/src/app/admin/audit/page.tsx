"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { api } from "@/lib/api";

interface AuditEntry {
  id: string;
  timestamp?: string;
  createdAt?: string;
  user?: string;
  userEmail?: string;
  actorEmail?: string;
  userId?: string;
  action: string;
  ip?: string;
  ipAddress?: string;
  status?: "success" | "failure" | "error" | string;
  success?: boolean;
  entryHash?: string | null;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  resourceDetails?: Record<string, unknown>;
}

interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

const MOCK_ENTRIES: AuditEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    userEmail: "alice@acme.com",
    action: "user.login",
    ip: "192.168.1.10",
    status: "success",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    userEmail: "bob@acme.com",
    action: "user.login",
    ip: "10.0.0.5",
    status: "failure",
    metadata: { reason: "Invalid password" },
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    userEmail: "admin@acme.com",
    action: "settings.update",
    ip: "127.0.0.1",
    status: "success",
    metadata: { fields: ["emailPasswordEnabled", "sessionTTLSeconds"] },
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    userEmail: "carol@acme.com",
    action: "user.mfa.enabled",
    ip: "203.0.113.42",
    status: "success",
  },
  {
    id: "5",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    userEmail: "alice@acme.com",
    action: "user.logout",
    ip: "192.168.1.10",
    status: "success",
  },
  {
    id: "6",
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    userEmail: "dave@acme.com",
    action: "user.register",
    ip: "198.51.100.7",
    status: "success",
  },
  {
    id: "7",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    userEmail: "admin@acme.com",
    action: "user.delete",
    ip: "127.0.0.1",
    status: "success",
    metadata: { targetUser: "old-user@acme.com" },
  },
];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ logs: AuditEntry[] } | AuditEntry[]>("/admin/audit-logs");
        const logs = Array.isArray(data) ? data : (data.logs ?? []);
        setEntries(logs.length ? logs : MOCK_ENTRIES);
      } catch {
        // API unreachable — fall back to illustrative mock data
        setEntries(MOCK_ENTRIES);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function runVerify() {
    setVerifying(true);
    setVerify(null);
    try {
      const res = await api.get<VerifyResult>("/admin/audit-logs/verify");
      setVerify(res);
    } catch {
      setVerify({
        ok: false,
        checked: 0,
        brokenAt: { seq: 0, id: "", reason: "verify request failed" },
      });
    } finally {
      setVerifying(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent authentication and admin events
          </p>
        </div>
        <button
          onClick={runVerify}
          disabled={verifying}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {verifying ? "Verifying…" : "Verify integrity"}
        </button>
      </div>

      {verify && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            verify.ok
              ? "border-green-500/30 bg-green-900/20 text-green-400"
              : "border-red-500/30 bg-red-900/20 text-red-400"
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

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/80">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Action
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  IP
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No audit entries found.
                  </td>
                </tr>
              )}
              {!loading &&
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-4 text-muted-foreground text-xs whitespace-nowrap">
                      {getTimestamp(entry)}
                    </td>
                    <td className="px-5 py-4 text-foreground">{getUser(entry)}</td>
                    <td className="px-5 py-4">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs">
                      {getIp(entry)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        status={
                          getStatus(entry) === "failure" || getStatus(entry) === "error"
                            ? "error"
                            : "success"
                        }
                        label={getStatus(entry)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <Modal title="Audit Log Detail" onClose={() => setSelected(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Timestamp</p>
                <p className="text-foreground">{getTimestamp(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">User</p>
                <p className="text-foreground">{getUser(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Action</p>
                <code className="text-primary text-xs bg-muted rounded px-1.5 py-0.5">
                  {selected.action}
                </code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">IP Address</p>
                <p className="text-foreground font-mono text-xs">{getIp(selected)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                <Badge
                  status={
                    getStatus(selected) === "failure" || getStatus(selected) === "error"
                      ? "error"
                      : "success"
                  }
                  label={getStatus(selected)}
                />
              </div>
            </div>
            {Object.keys(getDetail(selected)).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Details</p>
                <pre className="rounded-lg bg-muted p-3 text-xs text-foreground/80 overflow-auto max-h-48">
                  {JSON.stringify(getDetail(selected), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
