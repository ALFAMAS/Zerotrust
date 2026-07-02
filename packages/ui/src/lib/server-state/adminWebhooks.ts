"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { PaginatedResponse } from "./types";

export interface AdminWebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: string;
  attempt: number;
  responseStatus: number | null;
  error: string | null;
  recordedAt: string;
}

export interface AdminWebhookDeliveriesParams {
  page?: number;
  limit?: number;
}

export const adminWebhookKeys = queryKeys.admin.webhookDeliveries;

export function buildAdminWebhookDeliveriesPath(
  webhookId: string,
  params: AdminWebhookDeliveriesParams = {}
): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const qs = search.toString();
  const base = `/admin/webhooks/${webhookId}/deliveries`;
  return qs ? `${base}?${qs}` : base;
}

export function fetchAdminWebhookDeliveries(
  webhookId: string,
  params: AdminWebhookDeliveriesParams = {}
): Promise<PaginatedResponse<AdminWebhookDelivery>> {
  return apiGet<PaginatedResponse<AdminWebhookDelivery>>(
    buildAdminWebhookDeliveriesPath(webhookId, params)
  );
}

export function adminWebhookDeliveriesQueryOptions(
  webhookId: string,
  params: AdminWebhookDeliveriesParams = {}
) {
  return queryOptions({
    queryKey: adminWebhookKeys.list(
      webhookId,
      params as Record<string, string | number | undefined>
    ),
    queryFn: () => fetchAdminWebhookDeliveries(webhookId, params),
    enabled: Boolean(webhookId),
  });
}

export function useAdminWebhookDeliveriesQuery(
  webhookId: string,
  params: AdminWebhookDeliveriesParams = {}
) {
  return useQuery(adminWebhookDeliveriesQueryOptions(webhookId, params));
}
