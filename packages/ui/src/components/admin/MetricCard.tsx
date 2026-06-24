import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
}

/** Compact stat tile in the zerotrust dark/indigo design (replaces the emoji StatCard in admin). */
export default function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
