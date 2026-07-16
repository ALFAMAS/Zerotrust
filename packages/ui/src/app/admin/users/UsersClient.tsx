"use client";

import { useState } from "react";
import { usersColumns } from "@/app/admin/users/columns";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
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
import { useToast } from "@/context/ToastContext";
import {
  useAdminUserListDeleteMutation,
  useAdminUserListStatusMutation,
  useAdminUsersListQuery,
} from "@/lib/server-state/adminUsers";
import type { AdminUserListItem } from "@/lib/server-state/types";

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

  const columns = usersColumns({
    onToggleStatus: (user) => void handleToggleStatus(user),
    onDelete: (user) => void handleDelete(user),
    isTogglePending: statusMutation.isPending,
    isDeletePending: deleteMutation.isPending,
  });

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
            <DataTable
              columns={columns}
              data={users}
              isLoading={usersQuery.isPending}
              emptyMessage="No users found."
            />
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
