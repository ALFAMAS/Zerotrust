import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { AdminWebhookDelivery } from "@/lib/server-state/adminWebhooks";

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  delivered: "success",
  failed: "destructive",
  retrying: "warning",
  pending: "secondary",
};

export const webhookDeliveryColumns: ColumnDef<AdminWebhookDelivery>[] = [
  {
    accessorKey: "event",
    header: "Event",
    meta: { className: "font-mono text-xs" },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "attempt",
    header: "Attempt",
  },
  {
    accessorKey: "responseStatus",
    header: "HTTP",
    cell: ({ row }) => row.original.responseStatus ?? "—",
    meta: { className: "text-muted-foreground" },
  },
  {
    accessorKey: "recordedAt",
    header: "When",
    cell: ({ row }) => new Date(row.original.recordedAt).toLocaleString(),
    meta: { className: "text-muted-foreground" },
  },
];
