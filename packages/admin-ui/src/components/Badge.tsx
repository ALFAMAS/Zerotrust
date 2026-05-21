type BadgeVariant = "active" | "suspended" | "pending" | "deleted" | "approved" | "denied" | "revoked" | "default";

const variants: Record<BadgeVariant, string> = {
  active: "bg-emerald-900 text-emerald-300 border border-emerald-700",
  approved: "bg-emerald-900 text-emerald-300 border border-emerald-700",
  suspended: "bg-red-900 text-red-300 border border-red-700",
  denied: "bg-red-900 text-red-300 border border-red-700",
  revoked: "bg-red-900 text-red-300 border border-red-700",
  pending: "bg-amber-900 text-amber-300 border border-amber-700",
  deleted: "bg-gray-800 text-gray-400 border border-gray-600",
  default: "bg-gray-800 text-gray-300 border border-gray-600",
};

export function Badge({ label, variant = "default" }: { label: string; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  );
}
