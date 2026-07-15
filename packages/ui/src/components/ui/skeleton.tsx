import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: "none" | "sm" | "md" | "lg" | "full";
}

const roundedMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export function Skeleton({ className = "", rounded = "md", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted motion-reduce:animate-none",
        roundedMap[rounded],
        className
      )}
      {...props}
    />
  );
}

export function SkeletonText({
  className = "",
  width = "full",
}: {
  className?: string;
  width?: string;
}) {
  return (
    <Skeleton rounded="md" className={cn("h-4", width === "full" ? "w-full" : width, className)} />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-card p-6", className)}>
      <Skeleton rounded="md" className="h-5 w-2/3" />
      <Skeleton rounded="md" className="h-4 w-full" />
      <Skeleton rounded="md" className="h-4 w-4/5" />
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 4, columns = 4, className = "" }: SkeletonTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} rounded="md" className="h-3 flex-1" style={{ opacity: 0.6 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={colIdx} rounded="md" className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
