import { Badge as UIBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BadgeProps {
  status:
    | "active"
    | "suspended"
    | "deleted"
    | "pending"
    | "warning"
    | "error"
    | "success"
    | "expired"
    | string;
  label?: string;
}

const colorMap: Record<string, string> = {
  active: "bg-green-900/50 text-green-400 ring-1 ring-green-500/30",
  success: "bg-green-900/50 text-green-400 ring-1 ring-green-500/30",
  suspended: "bg-orange-900/50 text-orange-400 ring-1 ring-orange-500/30",
  warning: "bg-orange-900/50 text-orange-400 ring-1 ring-orange-500/30",
  deleted: "bg-red-900/50 text-red-400 ring-1 ring-red-500/30",
  error: "bg-red-900/50 text-red-400 ring-1 ring-red-500/30",
  pending: "bg-yellow-900/50 text-yellow-400 ring-1 ring-yellow-500/30",
  expired: "bg-muted text-muted-foreground ring-1 ring-border",
};

/** Status pill — wraps the shadcn Badge primitive with status-specific colors. */
export default function Badge({ status, label }: BadgeProps) {
  const cls = colorMap[status] ?? "bg-muted text-muted-foreground ring-1 ring-border";
  return (
    <UIBadge variant="outline" className={cn("rounded-full border-transparent font-medium", cls)}>
      {label ?? status}
    </UIBadge>
  );
}
