import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary-action text-secondary-action-foreground",
        destructive: "border-transparent bg-danger-subtle text-danger-subtle-foreground",
        success: "border-transparent bg-success-subtle text-success-subtle-foreground",
        warning: "border-transparent bg-warning-subtle text-warning-subtle-foreground",
        outline: "border-control bg-surface text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  status?: string;
  label?: React.ReactNode;
}

const statusVariants: Record<string, NonNullable<BadgeProps["variant"]>> = {
  active: "success",
  success: "success",
  suspended: "warning",
  warning: "warning",
  pending: "warning",
  deleted: "destructive",
  error: "destructive",
  expired: "outline",
};

function Badge({ className, variant, status, label, children, ...props }: BadgeProps) {
  const resolvedVariant = status ? (statusVariants[status] ?? "outline") : variant;
  return (
    <div className={cn(badgeVariants({ variant: resolvedVariant }), className)} {...props}>
      {children ?? label ?? status}
    </div>
  );
}

export { Badge, badgeVariants };
