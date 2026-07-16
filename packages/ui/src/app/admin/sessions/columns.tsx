import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminSession } from "@/lib/server-state/types";

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

function anomalyCount(flags: unknown): number {
  if (!flags) return 0;
  if (Array.isArray(flags)) return flags.length;
  if (typeof flags === "object") return Object.keys(flags as object).length;
  return 0;
}

export function isActiveSession(session: AdminSession): boolean {
  if (session.isActive === false || session.revokedAt) return false;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) return false;
  return true;
}

export function sessionStatus(session: AdminSession): "active" | "expired" | "revoked" {
  if (session.revokedAt) return "revoked";
  return isActiveSession(session) ? "active" : "expired";
}

interface SessionColumnOptions {
  isRevoking: (sessionId: string) => boolean;
  onRevoke: (session: AdminSession) => void;
}

export function createSessionColumns({
  isRevoking,
  onRevoke,
}: SessionColumnOptions): ColumnDef<AdminSession>[] {
  return [
    {
      id: "user",
      accessorFn: (session) =>
        [session.userEmail, session.userDisplayName, session.userId].filter(Boolean).join(" "),
      header: "User",
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="text-foreground">
            <div className="font-medium">
              {session.userEmail ?? `User ${session.userId ?? "unknown"}`}
            </div>
            {session.userDisplayName && (
              <div className="text-xs text-muted-foreground">{session.userDisplayName}</div>
            )}
          </div>
        );
      },
      meta: { className: "align-top" },
    },
    {
      id: "device",
      accessorFn: (session) =>
        [
          session.deviceFingerprint?.browser,
          session.deviceFingerprint?.os,
          session.deviceFingerprint?.platform,
          session.userAgent,
        ]
          .filter(Boolean)
          .join(" "),
      header: "Device",
      cell: ({ row }) => {
        const session = row.original;
        const fingerprint = session.deviceFingerprint;
        const deviceLabel =
          fingerprint?.browser || fingerprint?.os
            ? `${fingerprint?.browser || "Unknown"} on ${fingerprint?.os || "Unknown OS"}`
            : session.userAgent || "Unknown device";

        return (
          <div className="text-muted-foreground" title={session.userAgent ?? undefined}>
            <div className="flex items-center gap-2 text-foreground">
              {deviceLabel}
              {fingerprint?.isTrusted && (
                <span title="Trusted device">
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-success-subtle-foreground"
                    aria-hidden="true"
                  />
                </span>
              )}
            </div>
            {fingerprint?.platform && <div className="text-xs">{fingerprint.platform}</div>}
          </div>
        );
      },
      meta: { className: "align-top" },
    },
    {
      id: "location",
      accessorFn: (session) => [session.ipAddress, session.country].filter(Boolean).join(" "),
      header: "Location",
      cell: ({ row }) => (
        <div className="text-muted-foreground">
          <div className="font-mono text-xs">{row.original.ipAddress ?? "—"}</div>
          {row.original.country && <div className="text-xs">{row.original.country}</div>}
        </div>
      ),
      meta: { className: "align-top" },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.createdAt),
      meta: { className: "align-top text-xs text-muted-foreground" },
    },
    {
      accessorKey: "lastActivityAt",
      header: "Last active",
      cell: ({ row }) => formatDate(row.original.lastActivityAt),
      meta: { className: "align-top text-xs text-muted-foreground" },
    },
    {
      accessorKey: "expiresAt",
      header: "Expires",
      cell: ({ row }) => formatDate(row.original.expiresAt),
      meta: { className: "align-top text-xs text-muted-foreground" },
    },
    {
      id: "status",
      accessorFn: sessionStatus,
      header: "Status",
      cell: ({ row }) => {
        const session = row.original;
        const status = sessionStatus(session);
        const anomalies = anomalyCount(session.anomalyFlags);
        const badgeVariant =
          status === "revoked" ? "destructive" : status === "active" ? "success" : "secondary";

        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={badgeVariant}>{status}</Badge>
            {status === "revoked" && session.revokedReason && (
              <span className="text-xs text-muted-foreground">{session.revokedReason}</span>
            )}
            {anomalies > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-warning-subtle-foreground"
                title="Anomaly flags raised for this session"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {anomalies} {anomalies === 1 ? "anomaly" : "anomalies"}
              </span>
            )}
          </div>
        );
      },
      meta: { className: "align-top" },
    },
    {
      id: "actions",
      header: "Actions",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) =>
        isActiveSession(row.original) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(row.original)}
            disabled={isRevoking(row.original.id)}
            className="text-destructive hover:text-destructive"
          >
            Revoke
          </Button>
        ) : null,
      meta: { className: "align-top text-right", headerClassName: "text-right" },
    },
  ];
}
