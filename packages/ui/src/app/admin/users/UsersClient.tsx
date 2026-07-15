"use client";

import Link from "next/link";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/context/ToastContext";
import {
  useAdminUserListDeleteMutation,
  useAdminUserListStatusMutation,
  useAdminUsersListQuery,
} from "@/lib/server-state/adminUsers";
import type { AdminUserListItem } from "@/lib/server-state/types";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : null);

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  suspended: "secondary",
  deleted: "destructive",
};

export default function UsersClient() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const listParams = { page, search: search || undefined, status: statusFilter };
  const usersQuery = useAdminUsersListQuery(listParams);
  const statusMutation = useAdminUserListStatusMutation(listParams);
  const deleteMutation = useAdminUserListDeleteMutation(listParams);

  const users = usersQuery.data?.data ?? [];
  const pagination = usersQuery.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const hasUsers = users.length > 0;

  async function handleToggleStatus(user: AdminUserListItem) {
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await statusMutation.mutateAsync({ id: user.id, status: newStatus });
      toast({ message: `User ${newStatus}`, type: "success" });
    } catch {
      toast({ message: "Action failed", type: "error" });
    }
  }

  async function handleDelete(user: AdminUserListItem) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(user.id);
      toast({ message: "User deleted", type: "success" });
    } catch {
      toast({ message: "Delete failed", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={<>Users</>} description={<>{total} total users</>} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          type="text"
          placeholder="Search by email or name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ServerStateStatus
        isFetching={usersQuery.isFetching && !usersQuery.isPending}
        isStale={usersQuery.isStale}
        hasData={hasUsers}
        label="users"
        onRefresh={() => void usersQuery.refetch()}
      />

      {usersQuery.error && !hasUsers ? (
        <ErrorState message={usersQuery.error.message} retry={() => void usersQuery.refetch()} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!usersQuery.isPending && users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {!usersQuery.isPending &&
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                              {(u.displayName?.[0] ?? u.email[0]).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {u.displayName ?? u.email}
                              </p>
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
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(u.roles?.length ? u.roles : ["user"]).map((r) => (
                              <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[u.status] ?? "outline"}>{u.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(u.createdAt) ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmt(u.lastLoginAt) ?? "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/users/${u.id}`}>View</Link>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleToggleStatus(u)}
                              disabled={statusMutation.isPending}
                            >
                              {u.status === "active" ? "Suspend" : "Activate"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(u)}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
