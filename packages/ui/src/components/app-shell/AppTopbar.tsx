"use client";

import { LogOut, Menu } from "lucide-react";
import { brand } from "@/config/brand";

interface AppTopbarProps {
  brandSuffix?: string;
  onMenuClick: () => void;
  /** Right-aligned action cluster (locale switcher, theme toggle, notifications…). */
  actions?: React.ReactNode;
  onSignOut: () => void;
}

export default function AppTopbar({ brandSuffix, onMenuClick, actions, onSignOut }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      {/* Mobile: hamburger + brand (sidebar shows the brand on desktop) */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        aria-controls="app-sidebar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="font-display font-semibold tracking-tight text-foreground md:hidden">
        {brand.name}
        {brandSuffix && <span className="text-muted-foreground"> {brandSuffix}</span>}
      </span>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {actions}
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
