"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCommandPalette } from "@/lib/commandPalette";
import { cn } from "@/lib/utils";

interface AppTopbarSearchProps {
  className?: string;
  compact?: boolean;
}

export function AppTopbarSearch({ className, compact = false }: AppTopbarSearchProps) {
  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={openCommandPalette}
        aria-label="Open search"
        className={cn("h-11 w-11 shrink-0", className)}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Open command palette"
      className={cn(
        "flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-control bg-surface px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">Search pages, settings…</span>
      <kbd className="hidden shrink-0 rounded border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground lg:inline">
        ⌘K
      </kbd>
    </button>
  );
}
