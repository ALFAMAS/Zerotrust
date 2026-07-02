/**
 * TanStack Query options for server-side prefetch (P3.4).
 *
 * Kept separate from `"use client"` server-state modules so RSC page.tsx
 * files can import queryOptions + fetchers without crossing the client boundary.
 */

import { queryOptions } from "@tanstack/react-query";
import { serverApiGet } from "@/lib/serverApiClient";
import { queryKeys } from "./queryKeys";
import type { AdminRecentUser, AdminStats, AuthMe, PaginatedResponse, UserSession } from "./types";

export const AUTH_ME_PATH = "/auth/me";
export const USER_SESSIONS_PATH = "/sessions";
export const ADMIN_STATS_PATH = "/admin/stats";

export function buildAdminRecentUsersPath(limit = 5): string {
  return `/admin/users?limit=${limit}`;
}

function normalizeUserSessionsList(data: unknown): UserSession[] {
  if (Array.isArray(data)) return data;
  const record = data as { data?: UserSession[]; sessions?: UserSession[] };
  return record.data ?? record.sessions ?? [];
}

function normalizeRecentUsers(
  data: PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }
): AdminRecentUser[] {
  if (Array.isArray(data)) return data;
  if ("users" in data && Array.isArray(data.users)) return data.users;
  if ("data" in data && Array.isArray(data.data)) return data.data;
  return [];
}

export function authMePrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.auth.me(),
    queryFn: () => serverApiGet<AuthMe>(AUTH_ME_PATH),
  });
}

export function userSessionsPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.sessions.list(),
    queryFn: () => serverApiGet<unknown>(USER_SESSIONS_PATH).then(normalizeUserSessionsList),
  });
}

export function adminStatsPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => serverApiGet<AdminStats>(ADMIN_STATS_PATH),
  });
}

export function adminRecentUsersPrefetchOptions(limit = 5) {
  return queryOptions({
    queryKey: [...queryKeys.admin.stats(), "recentUsers", { limit }] as const,
    queryFn: () =>
      serverApiGet<
        PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }
      >(buildAdminRecentUsersPath(limit)).then(normalizeRecentUsers),
  });
}
