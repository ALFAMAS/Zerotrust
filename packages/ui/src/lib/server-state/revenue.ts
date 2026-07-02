"use client";

import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { BroadcastInput, BroadcastResponse, RevenueData } from "./types";

export const revenueKeys = queryKeys.admin.revenue;

export const REVENUE_PATH = "/admin/revenue";
export const BROADCAST_PATH = "/admin/broadcast";

export function fetchRevenue(): Promise<RevenueData> {
  return apiGet<RevenueData>(REVENUE_PATH);
}

export function revenueQueryOptions() {
  return queryOptions({
    queryKey: revenueKeys.summary(),
    queryFn: fetchRevenue,
  });
}

export function useRevenueQuery() {
  return useQuery(revenueQueryOptions());
}

export function useSendBroadcastMutation() {
  return useMutation<BroadcastResponse, Error, BroadcastInput>({
    mutationFn: (input) => apiPost<BroadcastResponse>(BROADCAST_PATH, input),
  });
}
