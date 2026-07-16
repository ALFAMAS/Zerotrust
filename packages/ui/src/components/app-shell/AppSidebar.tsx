"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  /** Optional visible section label for dense navigation such as the admin shell. */
  group?: string;
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
  "use memo";

  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-tour={`nav-${item.href}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors before:absolute before:inset-y-2 before:start-0 before:rounded-full before:transition-[width] motion-reduce:transition-none motion-reduce:before:transition-none",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        active
          ? "bg-muted font-semibold text-foreground before:w-1 before:bg-secondary-action"
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
  "use memo";

  const pathname = usePathname();
  const groups = items.reduce<Array<{ label?: string; items: NavItem[] }>>((result, item) => {
    const current = result.at(-1);
    if (current && current.label === item.group) {
      current.items.push(item);
    } else {
      result.push({ label: item.group, items: [item] });
    }
    return result;
  }, []);

  return (
    <aside
      id={showCollapseToggle ? "app-sidebar-desktop" : undefined}
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none",
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
          className={cn("flex items-center gap-3 overflow-hidden", collapsed && "justify-center")}
          aria-label={
            collapsed ? `${brand.name}${brandSuffix ? ` ${brandSuffix}` : ""}` : undefined
          }
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-xs font-bold text-primary-foreground">
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
            className="shrink-0 text-muted-foreground"
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
            className="text-muted-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4" aria-label="Sidebar">
          {groups.map((group, index) => (
            <section
              key={group.label ?? `navigation-${index}`}
              aria-labelledby={group.label ? `sidebar-group-${index}` : undefined}
              className="space-y-1"
            >
              {group.label ? (
                <h2
                  id={`sidebar-group-${index}`}
                  className={cn(
                    "px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    collapsed && "sr-only"
                  )}
                >
                  {group.label}
                </h2>
              ) : null}
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </section>
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
  "use memo";

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 ease-out min-[1024px]:block",
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

      <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay min-[1024px]:hidden" />
          <DialogPrimitive.Content
            id="app-sidebar"
            aria-describedby={undefined}
            className="fixed inset-y-0 start-0 z-50 w-64 border-0 bg-surface p-0 shadow-lg outline-none min-[1024px]:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                className="absolute end-2 top-2 z-10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
            <SidebarContent
              items={items}
              brandSuffix={brandSuffix}
              footer={footer}
              collapsed={false}
              onNavigate={onClose}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
