"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCommandPalette } from "@/lib/commandPalette";
import { cn } from "@/lib/utils";

interface AppTopbarSearchProps {
  className?: string;
  compact?: boolean;
}

export function AppTopbarSearch({
  className,
  compact = false,
}: AppTopbarSearchProps) {
  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={openCommandPalette}
        aria-label="Open search"
        className={cn("h-9 w-9 shrink-0", className)}
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
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">
        Search pages, settings…
      </span>
      <kbd className="hidden shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
        ⌘K
      </kbd>
    </button>
  );
}
