import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Metric } from "@/components/ui/page-patterns";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
}

/** Compact, border-led metric tile for dense operational dashboards. */
export default function MetricCard({ icon: Icon, label, value, hint }: MetricCardProps) {
  return (
    <Metric
      label={label}
      value={value}
      hint={hint}
      icon={
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-control bg-muted text-secondary-action">
          <Icon className="h-5 w-5" />
        </span>
      }
    />
  );
}
