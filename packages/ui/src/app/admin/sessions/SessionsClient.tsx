"use client";

import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import {
  useAdminSessionsListQuery,
  useRevokeAdminSessionMutation,
} from "@/lib/server-state/sessions";
import type { AdminSession } from "@/lib/server-state/types";
import { createSessionColumns, isActiveSession } from "./columns";

type TabFilter = "all" | "active" | "expired";

export default function SessionsClient() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);

  const sessionsQuery = useAdminSessionsListQuery({ page, limit: 20 });
  const revokeMutation = useRevokeAdminSessionMutation({ page, limit: 20 });

  const sessions = sessionsQuery.data?.data ?? [];
  const pagination = sessionsQuery.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const loading = sessionsQuery.isLoading;
  const error = sessionsQuery.error;

  async function handleRevoke(session: AdminSession) {
    try {
      await revokeMutation.mutateAsync(session.id);
      toast({ message: "Session revoked", type: "success" });
    } catch {
      toast({ message: "Failed to revoke session", type: "error" });
    }
  }

  const filtered = sessions.filter((session) => {
    if (tab === "all") return true;
    return tab === "active" ? isActiveSession(session) : !isActiveSession(session);
  });

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "expired", label: "Expired" },
  ];
  const columns = createSessionColumns({
    isRevoking: (sessionId) => revokeMutation.isPending && revokeMutation.variables === sessionId,
    onRevoke: (session) => void handleRevoke(session),
  });

  if (error && !sessionsQuery.data) {
    return (
      <ErrorState
        message={error.message || "Failed to load sessions"}
        retry={() => void sessionsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title={<>Sessions</>} description={<>{total} total sessions</>} />
      </div>

      <ServerStateStatus
        isFetching={sessionsQuery.isFetching}
        isStale={sessionsQuery.isStale}
        hasData={sessions.length > 0}
        label="sessions"
        onRefresh={() => void sessionsQuery.refetch()}
      />

      <div className="flex gap-1 border-b border-border">
        {tabs.map((item) => (
          <Button
            type="button"
            key={item.key}
            variant="ghost"
            onClick={() => setTab(item.key)}
            className={`px-4 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === item.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tab === "all"
              ? "All sessions"
              : tab === "active"
                ? "Active sessions"
                : "Inactive sessions"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={loading}
            emptyMessage="No sessions found."
            search={{ placeholder: "Search sessions" }}
            tableLabel="Admin sessions"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
