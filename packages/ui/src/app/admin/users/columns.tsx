"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUserListItem } from "@/lib/server-state/types";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : null);

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  suspended: "secondary",
  deleted: "destructive",
};

export interface UsersColumnActions {
  onToggleStatus: (user: AdminUserListItem) => void;
  onDelete: (user: AdminUserListItem) => void;
  isTogglePending: boolean;
  isDeletePending: boolean;
}

export function usersColumns(actions: UsersColumnActions): ColumnDef<AdminUserListItem>[] {
  return [
    {
      id: "user",
      header: "User",
      accessorFn: (row) => row.displayName ?? row.email,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
              {(u.displayName?.[0] ?? u.email[0]).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-foreground">{u.displayName ?? u.email}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {u.emailVerifiedAt ? (
                  <span
                    className="text-xs text-success-subtle-foreground"
                    title={`Verified ${fmt(u.emailVerifiedAt)}`}
                  >
                    ✓ verified
                  </span>
                ) : (
                  <span
                    className="text-xs text-warning-subtle-foreground"
                    title="Email not verified"
                  >
                    unverified
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "roles",
      header: "Roles",
      accessorFn: (row) => (row.roles?.length ? row.roles.join(", ") : "user"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.roles?.length ? row.original.roles : ["user"]).map((r) => (
            <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
              {r}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{fmt(row.original.createdAt) ?? "—"}</span>
      ),
    },
    {
      id: "lastLoginAt",
      header: "Last Login",
      accessorFn: (row) => row.lastLoginAt ?? "",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {fmt(row.original.lastLoginAt) ?? "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "text-right", headerClassName: "text-right" },
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/users/${u.id}`}>View</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => actions.onToggleStatus(u)}
              disabled={actions.isTogglePending}
            >
              {u.status === "active" ? "Suspend" : "Activate"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => actions.onDelete(u)}
              disabled={actions.isDeletePending}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];
}
