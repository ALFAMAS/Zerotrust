"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";
import { usePaginatedApi } from "@/lib/hooks/useApi";

interface User {
  id: string;
  displayName?: string;
  email: string;
  status: "active" | "suspended" | "deleted" | string;
  roles?: string[];
  emailVerifiedAt?: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : null);

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  suspended: "secondary",
  deleted: "destructive",
};

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const filterParams = new URLSearchParams({
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  }).toString();

  const {
    items: users,
    loading,
    pagination,
    page,
    setPage,
    refetch,
  } = usePaginatedApi<User>(`/admin/users${filterParams ? `?${filterParams}` : ""}`, {
    onError: () => showToast("Failed to load users"),
  });
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  async function handleToggleStatus(user: User) {
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await api.patch(`/admin/users/${user.id}`, { status: newStatus });
      showToast(`User ${newStatus}`);
      await refetch();
    } catch {
      showToast("Action failed");
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      showToast("User deleted");
      await refetch();
    } catch {
      showToast("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total users</p>
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
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
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
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                              {u.emailVerifiedAt ? (
                                <span
                                  className="text-[10px] text-emerald-500"
                                  title={`Verified ${fmt(u.emailVerifiedAt)}`}
                                >
                                  ✓ verified
                                </span>
                              ) : (
                                <span
                                  className="text-[10px] text-amber-500"
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
                            onClick={() => handleToggleStatus(u)}
                          >
                            {u.status === "active" ? "Suspend" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(u)}
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
