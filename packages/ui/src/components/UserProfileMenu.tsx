"use client";

import {
  LayoutDashboard,
  LogOut,
  Shield,
  User,
  Wallet as WalletIcon,
} from "lucide-react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthMeQuery } from "@/lib/server-state/auth";
import { useWalletQuery } from "@/lib/server-state/wallet";

interface UserProfileMenuProps {
  onSignOut: () => void;
  /** When set, show a shortcut back to the user dashboard (admin shell). */
  showDashboardLink?: boolean;
}

function formatWalletBalance(
  cents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    (cents ?? 0) / 100,
  );
}

function initialsFor(name: string | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (source[0] ?? "?").toUpperCase();
}

export function UserProfileMenu({
  onSignOut,
  showDashboardLink = false,
}: UserProfileMenuProps) {
  const router = useRouter();
  const locale = useLocale();
  const { data: me } = useAuthMeQuery();
  const { data: wallet } = useWalletQuery();

  const isAdmin = me?.roles?.includes("admin") ?? false;
  const currency = wallet?.currency ?? "USD";
  const balanceLabel = formatWalletBalance(
    wallet?.balance ?? 0,
    currency,
    locale,
  );
  const displayName = me?.displayName?.trim() || me?.email || "Account";
  const email = me?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto gap-2 rounded-full py-1 pl-2 pr-1.5 hover:bg-accent"
          aria-label="Open account menu"
        >
          <span className="hidden max-w-[7rem] truncate text-sm font-medium tabular-nums text-foreground sm:inline">
            {balanceLabel}
          </span>
          <Avatar className="h-8 w-8 border border-border">
            {me?.avatarUrl ? <AvatarImage src={me.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initialsFor(me?.displayName, email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium text-foreground">
            {displayName}
          </div>
          {email ? (
            <div className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/wallet" className="cursor-pointer">
            <WalletIcon />
            <span className="flex-1">Balance</span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {balanceLabel}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile" className="cursor-pointer">
            <User />
            Profile
          </Link>
        </DropdownMenuItem>
        {showDashboardLink ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="cursor-pointer">
              <LayoutDashboard />
              User dashboard
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isAdmin && !showDashboardLink ? (
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => router.push("/admin")}
          >
            <Shield />
            Admin
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={() => onSignOut()}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
