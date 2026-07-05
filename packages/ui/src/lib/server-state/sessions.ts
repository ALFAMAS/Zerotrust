"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AdminSession,
  AdminSessionsListParams,
  PaginatedResponse,
  UserSession,
} from "./types";

export const sessionKeys = queryKeys.admin.sessions;

const DEFAULT_LIST_LIMIT = 20;

export function buildAdminSessionsListPath(params: AdminSessionsListParams = {}): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `/admin/sessions?${qs}` : "/admin/sessions";
}

export function buildAdminSessionRevokePath(id: string): string {
  return `/admin/sessions/${id}`;
}

export function normalizeAdminSessionsListParams(
  params: AdminSessionsListParams = {}
): Required<Pick<AdminSessionsListParams, "page" | "limit">> & AdminSessionsListParams {
  return { page: params.page ?? 1, limit: params.limit ?? DEFAULT_LIST_LIMIT, ...params };
}

export function fetchAdminSessionsList(
  params: AdminSessionsListParams = {}
): Promise<PaginatedResponse<AdminSession>> {
  const normalized = normalizeAdminSessionsListParams(params);
  return apiGet<PaginatedResponse<AdminSession>>(buildAdminSessionsListPath(normalized));
}

export function adminSessionsListQueryOptions(params: AdminSessionsListParams = {}) {
  const normalized = normalizeAdminSessionsListParams(params);
  return queryOptions({
    queryKey: sessionKeys.list(normalized),
    queryFn: () => fetchAdminSessionsList(normalized),
  });
}

export function useAdminSessionsListQuery(params: AdminSessionsListParams = {}) {
  return useQuery(adminSessionsListQueryOptions(params));
}

interface RevokeSessionMutationContext {
  previous?: PaginatedResponse<AdminSession>;
  listKey: ReturnType<typeof sessionKeys.list>;
}

export function useRevokeAdminSessionMutation(params: AdminSessionsListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = sessionKeys.list(normalizeAdminSessionsListParams(params));

  return useMutation<unknown, Error, string, RevokeSessionMutationContext>({
    mutationFn: (id) => apiDelete(buildAdminSessionRevokePath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PaginatedResponse<AdminSession>>(listKey);
      queryClient.setQueryData<PaginatedResponse<AdminSession>>(listKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          data: current.data.map((session) =>
            session.id === id
              ? {
                  ...session,
                  isActive: false,
                  revokedAt: new Date().toISOString(),
                  revokedReason: session.revokedReason ?? "admin_revoked",
                }
              : session
          ),
        };
      });
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
    },
  });
}

export const userSessionKeys = queryKeys.sessions;

export const USER_SESSIONS_PATH = "/sessions";
export const USER_SESSION_ACTIVE_ORG_PATH = "/sessions/active-org";

export function buildUserSessionPath(id: string): string {
  return `${USER_SESSIONS_PATH}/${id}`;
}

function normalizeUserSessionsList(data: unknown): UserSession[] {
  if (Array.isArray(data)) return data;
  const record = data as { data?: UserSession[]; sessions?: UserSession[] };
  return record.data ?? record.sessions ?? [];
}

export function fetchUserSessionsList(): Promise<UserSession[]> {
  return apiGet<unknown>(USER_SESSIONS_PATH).then(normalizeUserSessionsList);
}

export function userSessionsListQueryOptions() {
  return queryOptions({
    queryKey: userSessionKeys.list(),
    queryFn: fetchUserSessionsList,
  });
}

export function useUserSessionsListQuery() {
  return useQuery(userSessionsListQueryOptions());
}

interface RevokeUserSessionMutationContext {
  previous?: UserSession[];
  listKey: ReturnType<typeof userSessionKeys.list>;
}

export function useRevokeUserSessionMutation() {
  const queryClient = useQueryClient();
  const listKey = userSessionKeys.list();

  return useMutation<unknown, Error, string, RevokeUserSessionMutationContext>({
    mutationFn: (id) => apiDelete(buildUserSessionPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<UserSession[]>(listKey);
      queryClient.setQueryData<UserSession[]>(listKey, (current) =>
        current
          ? current.map((session) =>
              session.id === id ? { ...session, isActive: false } : session
            )
          : current
      );
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userSessionKeys.list() });
    },
  });
}

export function useRevokeAllUserSessionsMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, void>({
    mutationFn: () => apiDelete(USER_SESSIONS_PATH),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userSessionKeys.list() });
    },
  });
}

export function useSetActiveOrgMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ activeOrgId: string }, Error, { orgId: string }>({
    mutationFn: ({ orgId }) => apiPut(USER_SESSION_ACTIVE_ORG_PATH, { orgId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
