interface BadgeProps {
  status: "active" | "suspended" | "deleted" | "pending" | "warning" | "error" | "success" | "expired" | string;
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
  expired: "bg-gray-800 text-gray-400 ring-1 ring-gray-600/30",
};

export default function Badge({ status, label }: BadgeProps) {
  const cls = colorMap[status] ?? "bg-gray-800 text-gray-400 ring-1 ring-gray-600/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label ?? status}
    </span>
  );
}
