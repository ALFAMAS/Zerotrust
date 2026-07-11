"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "../queryKeys";

export interface AdminAnalytics {
  cohorts: Array<{ cohortWeek: string; cohortSize: number; retention: number[] }>;
  authMethodMix: { password: number; oauth: number; passkey: number; total: number };
  anomalyTrends: Array<{ date: string; flaggedSessions: number }>;
}

export function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  return apiGet<AdminAnalytics>("/admin/analytics");
}

export function adminAnalyticsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.analytics(),
    queryFn: fetchAdminAnalytics,
    staleTime: 60_000,
  });
}

export function useAnalyticsQuery() {
  return useQuery(adminAnalyticsQueryOptions());
}
