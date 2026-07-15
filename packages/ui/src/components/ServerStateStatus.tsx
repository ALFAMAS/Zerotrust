"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServerStateStatusProps {
  isFetching?: boolean;
  isStale?: boolean;
  hasData?: boolean;
  label?: string;
  onRefresh?: () => void;
  /** Pass a TanStack Query result to derive status props automatically. */
  query?: Pick<UseQueryResult, "isFetching" | "isStale" | "data" | "refetch">;
}

export function ServerStateStatus({
  isFetching: isFetchingProp,
  isStale: isStaleProp = false,
  hasData: hasDataProp = false,
  label = "data",
  onRefresh: onRefreshProp,
  query,
}: ServerStateStatusProps) {
  const isFetching = query?.isFetching ?? isFetchingProp ?? false;
  const isStale = query?.isStale ?? isStaleProp;
  const hasData = query ? query.data !== undefined : hasDataProp;
  const onRefresh = onRefreshProp ?? (query ? () => void query.refetch() : undefined);
  if (!hasData) return null;

  if (isFetching) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Refreshing {label}…</span>
        {isStale && (
          <span className="text-muted-foreground">Showing cached {label} while refreshing.</span>
        )}
      </div>
    );
  }

  if (!isStale) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
      <span>Cached {label} may be stale.</span>
      {onRefresh && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onRefresh}
        >
          Refresh
        </Button>
      )}
    </div>
  );
}
