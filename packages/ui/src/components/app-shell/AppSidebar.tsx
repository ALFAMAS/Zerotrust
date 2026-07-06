"use client";

import type { LucideIcon } from "lucide-react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** When true, only highlight on an exact path match (use for index routes). */
  exact?: boolean;
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface SidebarNavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}

function SidebarNavLink({ item, active, collapsed, onNavigate }: SidebarNavLinkProps) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-tour={`nav-${item.href}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

interface SidebarContentProps {
  items: NavItem[];
  brandSuffix?: string;
  footer?: React.ReactNode;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate: () => void;
  /** Desktop sidebar gets a collapse toggle; mobile drawer does not. */
  showCollapseToggle?: boolean;
}

function SidebarContent({
  items,
  brandSuffix,
  footer,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  showCollapseToggle = false,
}: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <aside
      id={showCollapseToggle ? "app-sidebar-desktop" : undefined}
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between px-3"
        )}
      >
        <Link
          href={items[0]?.href ?? "/"}
          onClick={onNavigate}
          className={cn("flex items-center gap-2.5 overflow-hidden", collapsed && "justify-center")}
          aria-label={
            collapsed ? `${brand.name}${brandSuffix ? ` ${brandSuffix}` : ""}` : undefined
          }
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold text-white"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          {!collapsed && (
            <span className="truncate font-display text-base font-semibold tracking-tight text-foreground">
              {brand.name}
              {brandSuffix && <span className="text-muted-foreground"> {brandSuffix}</span>}
            </span>
          )}
        </Link>

        {showCollapseToggle && onToggleCollapsed && !collapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            aria-expanded
            aria-controls="app-sidebar-desktop"
            className="h-8 w-8 shrink-0 text-muted-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showCollapseToggle && onToggleCollapsed && collapsed && (
        <div className="flex shrink-0 justify-center border-b border-border py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            aria-expanded={false}
            aria-controls="app-sidebar-desktop"
            className="h-8 w-8 text-muted-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" aria-label="Sidebar">
          {items.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </TooltipProvider>

      {footer && (
        <div
          className={cn(
            "shrink-0 space-y-1 border-t border-border py-4",
            collapsed
              ? "px-2 [&_a]:justify-center [&_a]:px-2 [&_.sidebar-footer-label]:sr-only"
              : "px-3"
          )}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

interface AppSidebarProps {
  items: NavItem[];
  open: boolean;
  onClose: () => void;
  brandSuffix?: string;
  footer?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function AppSidebar({
  items,
  open,
  onClose,
  brandSuffix,
  footer,
  collapsed = false,
  onToggleCollapsed,
}: AppSidebarProps) {
  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent
          items={items}
          brandSuffix={brandSuffix}
          footer={footer}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          onNavigate={() => {}}
          showCollapseToggle
        />
      </div>

      {/* Mobile: slide-over drawer — always full width */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <Button
          type="button"
          variant="ghost"
          aria-label="Close menu"
          className={cn(
            "absolute inset-0 h-auto w-auto rounded-none bg-black/60 p-0 transition-opacity hover:bg-black/60",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={onClose}
        />
        <div
          id="app-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            "absolute inset-y-0 left-0 w-64 transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <SidebarContent
            items={items}
            brandSuffix={brandSuffix}
            footer={footer}
            collapsed={false}
            onNavigate={onClose}
          />
        </div>
      </div>
    </>
  );
}
