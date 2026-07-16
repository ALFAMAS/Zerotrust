"use client";

import { Webhook } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/page-patterns";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import { useAdminWebhookDeliveriesQuery } from "@/lib/server-state/adminWebhooks";
import { webhookDeliveryColumns } from "./columns";

export default function AdminWebhookDeliveriesPage() {
  const [webhookId, setWebhookId] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const deliveriesQuery = useAdminWebhookDeliveriesQuery(submittedId, { limit: 50 });
  const deliveries = deliveriesQuery.data?.data ?? [];

  function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setSubmittedId(webhookId.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Webhook className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <PageHeader
            title={<>Webhook delivery log</>}
            description={<>Admin-wide delivery attempts for any webhook endpoint (cross-tenant).</>}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lookup deliveries</CardTitle>
          <CardDescription>
            Enter a webhook endpoint ID to view its delivery history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilterBar onSubmit={handleLookup}>
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="webhookId">Webhook ID</Label>
              <Input
                id="webhookId"
                value={webhookId}
                onChange={(event) => setWebhookId(event.target.value)}
                placeholder="uuid"
                required
              />
            </div>
            <Button type="submit">Load deliveries</Button>
          </FilterBar>
        </CardContent>
      </Card>

      {submittedId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Deliveries for {submittedId.slice(0, 8)}…</CardTitle>
              <CardDescription>
                {deliveriesQuery.data?.pagination?.total ?? 0} attempts
              </CardDescription>
            </div>
            <ServerStateStatus query={deliveriesQuery} />
          </CardHeader>
          <CardContent>
            {deliveriesQuery.error ? (
              <ErrorState
                message={deliveriesQuery.error.message}
                retry={() => deliveriesQuery.refetch()}
              />
            ) : deliveriesQuery.isPending ? (
              <SkeletonList count={5} />
            ) : (
              <DataTable
                columns={webhookDeliveryColumns}
                data={deliveries}
                emptyMessage="No deliveries found."
                search={{ placeholder: "Search webhook deliveries" }}
                tableLabel="Webhook deliveries"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
