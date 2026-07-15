"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Loading spinner placeholder. Replaces repeated loading skeleton patterns.
 */
export function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`flex items-center justify-center py-8 ${className}`}
    >
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent motion-reduce:animate-none"
      />
    </div>
  );
}

/**
 * Empty state placeholder. Repeated across 40+ pages with minor variations.
 */
export function EmptyState({
  icon: Icon,
  title = "Nothing here yet",
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Error state. Replaces repeated catch-block UI.
 */
export function ErrorState({
  message = "Something went wrong",
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-danger-subtle-foreground/40 bg-danger-subtle px-6 py-8 text-center text-danger-subtle-foreground"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-danger-subtle-foreground/40 bg-surface text-danger-subtle-foreground">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">{message}</p>
      {retry && (
        <Button type="button" variant="outline" onClick={retry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Loading skeleton card. Replace SkeletonCard for simple list previews.
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 w-full animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
