"use client";

import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiGetBlob } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AdminRecentUser, AdminStats, PaginatedResponse } from "./types";

export const adminDashboardKeys = queryKeys.admin;

export const ADMIN_STATS_PATH = "/admin/stats";
export const ADMIN_USERS_EXPORT_PATH = "/admin/users/export";

export function buildAdminRecentUsersPath(limit = 5): string {
  return `/admin/users?limit=${limit}`;
}

export function fetchAdminStats(): Promise<AdminStats> {
  return apiGet<AdminStats>(ADMIN_STATS_PATH);
}

export function adminStatsQueryOptions() {
  return queryOptions({
    queryKey: adminDashboardKeys.stats(),
    queryFn: fetchAdminStats,
  });
}

export function useAdminStatsQuery() {
  return useQuery(adminStatsQueryOptions());
}

function normalizeRecentUsers(
  data: PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }
): AdminRecentUser[] {
  if (Array.isArray(data)) return data;
  if ("users" in data && Array.isArray(data.users)) return data.users;
  if ("data" in data && Array.isArray(data.data)) return data.data;
  return [];
}

export function fetchAdminRecentUsers(limit = 5): Promise<AdminRecentUser[]> {
  return apiGet<PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }>(
    buildAdminRecentUsersPath(limit)
  ).then(normalizeRecentUsers);
}

export function adminRecentUsersQueryOptions(limit = 5) {
  return queryOptions({
    queryKey: [...adminDashboardKeys.stats(), "recentUsers", { limit }] as const,
    queryFn: () => fetchAdminRecentUsers(limit),
  });
}

export function useAdminRecentUsersQuery(limit = 5) {
  return useQuery(adminRecentUsersQueryOptions(limit));
}

export function useExportUsersMutation() {
  return useMutation<Blob, Error, void>({
    mutationFn: () => apiGetBlob(ADMIN_USERS_EXPORT_PATH),
  });
}
