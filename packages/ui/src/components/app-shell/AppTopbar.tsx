"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { AppTopbarSearch } from "./AppTopbarSearch";

interface AppTopbarProps {
  brandSuffix?: string;
  onMenuClick: () => void;
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  /** Right-aligned action cluster (locale switcher, theme toggle, notifications…). */
  actions?: React.ReactNode;
  /** Profile avatar menu (balance, admin link, sign out). */
  profileMenu?: React.ReactNode;
}

export default function AppTopbar({
  brandSuffix,
  onMenuClick,
  menuButtonRef,
  actions,
  profileMenu,
}: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface px-4 sm:gap-3 sm:px-6">
      {/* Mobile: hamburger + brand (sidebar shows the brand on desktop) */}
      <Button
        ref={menuButtonRef}
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        aria-controls="app-sidebar"
        className="h-11 w-11 shrink-0 min-[1024px]:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="max-w-24 shrink-0 truncate font-display font-semibold tracking-tight text-foreground min-[1024px]:hidden">
        {brand.name}
        {brandSuffix && <span className="text-muted-foreground"> {brandSuffix}</span>}
      </span>

      <AppTopbarSearch compact className="hidden min-[768px]:inline-flex min-[1024px]:hidden" />
      <div className="hidden min-w-0 flex-1 min-[1024px]:block min-[1024px]:max-w-lg">
        <AppTopbarSearch />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {actions}
        {profileMenu}
      </div>
    </header>
  );
}
