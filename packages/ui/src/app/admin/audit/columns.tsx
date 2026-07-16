import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditEntry } from "@/lib/server-state/types";

export function getAuditStatus(entry: AuditEntry): string {
  if (entry.success === false) return "failure";
  if (entry.success === true) return "success";
  return entry.status ?? "success";
}

export function getAuditTimestamp(entry: AuditEntry): string {
  const value = entry.timestamp ?? entry.createdAt;
  return value ? new Date(value).toLocaleString() : "—";
}

export function getAuditUser(entry: AuditEntry): string {
  return entry.actorEmail ?? entry.userEmail ?? entry.user ?? entry.userId ?? "—";
}

export function getAuditIp(entry: AuditEntry): string {
  return entry.ip ?? entry.ipAddress ?? "—";
}

export function getAuditDetail(entry: AuditEntry): Record<string, unknown> {
  return entry.metadata ?? entry.details ?? entry.resourceDetails ?? {};
}

export function AuditStatusBadge({ entry }: { entry: AuditEntry }) {
  const status = getAuditStatus(entry);
  const failed = status === "failure" || status === "error";
  return <Badge variant={failed ? "destructive" : "success"}>{status}</Badge>;
}

export function createAuditColumns(onView: (entry: AuditEntry) => void): ColumnDef<AuditEntry>[] {
  return [
    {
      id: "timestamp",
      accessorFn: (entry) => entry.timestamp ?? entry.createdAt ?? "",
      header: "Timestamp",
      cell: ({ row }) => getAuditTimestamp(row.original),
      meta: { className: "whitespace-nowrap text-xs text-muted-foreground" },
    },
    {
      id: "user",
      accessorFn: getAuditUser,
      header: "User",
      cell: ({ row }) => getAuditUser(row.original),
      meta: { className: "text-foreground" },
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <code className="rounded bg-muted px-2 py-1 text-xs text-primary">
          {row.original.action}
        </code>
      ),
    },
    {
      id: "ip",
      accessorFn: getAuditIp,
      header: "IP",
      cell: ({ row }) => getAuditIp(row.original),
      meta: { className: "font-mono text-xs text-muted-foreground" },
    },
    {
      id: "status",
      accessorFn: getAuditStatus,
      header: "Status",
      cell: ({ row }) => <AuditStatusBadge entry={row.original} />,
    },
    {
      id: "details",
      header: "Details",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <Button type="button" variant="ghost" size="sm" onClick={() => onView(row.original)}>
          View details
        </Button>
      ),
      meta: { className: "text-right", headerClassName: "text-right" },
    },
  ];
}
