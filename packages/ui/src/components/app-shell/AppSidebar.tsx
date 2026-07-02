"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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

interface SidebarContentProps {
  items: NavItem[];
  brandSuffix?: string;
  footer?: React.ReactNode;
  onNavigate: () => void;
}

function SidebarContent({ items, brandSuffix, footer, onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        <Link
          href={items[0]?.href ?? "/"}
          onClick={onNavigate}
          className="flex items-center gap-2.5"
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg font-display text-xs font-bold text-white"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-foreground">
            {brand.name}
            {brandSuffix && <span className="text-muted-foreground"> {brandSuffix}</span>}
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Sidebar">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-tour={`nav-${item.href}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {footer && (
        <div className="shrink-0 space-y-1 border-t border-border px-3 py-4">{footer}</div>
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
}

export default function AppSidebar({ items, open, onClose, brandSuffix, footer }: AppSidebarProps) {
  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-64 md:block">
        <SidebarContent
          items={items}
          brandSuffix={brandSuffix}
          footer={footer}
          onNavigate={() => {}}
        />
      </div>

      {/* Mobile: slide-over drawer */}
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
            onNavigate={onClose}
          />
        </div>
      </div>
    </>
  );
}
