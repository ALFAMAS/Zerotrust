"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserStatus,
  AdminUsersListParams,
  CustomerSegment,
  PaginatedResponse,
  UpdateAdminUserListStatusInput,
} from "./types";

export const adminUserKeys = queryKeys.admin.users;

const DEFAULT_LIST_LIMIT = 20;

export const CUSTOMER_SEGMENTS: CustomerSegment[] = ["champion", "at_risk", "expansion", "new"];

export function buildAdminUserDetailPath(id: string): string {
  return `/admin/users/${id}`;
}

export function buildAdminUsersListPath(params: AdminUsersListParams = {}): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.status && params.status !== "all") search.set("status", params.status);
  const qs = search.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export function normalizeAdminUsersListParams(
  params: AdminUsersListParams = {}
): Required<Pick<AdminUsersListParams, "page" | "limit">> & AdminUsersListParams {
  return { page: params.page ?? 1, limit: params.limit ?? DEFAULT_LIST_LIMIT, ...params };
}

function adminUsersListKey(params: AdminUsersListParams = {}) {
  return adminUserKeys.list(
    normalizeAdminUsersListParams(params) as unknown as Record<string, string | number | undefined>
  );
}

export function fetchAdminUsersList(
  params: AdminUsersListParams = {}
): Promise<PaginatedResponse<AdminUserListItem>> {
  const normalized = normalizeAdminUsersListParams(params);
  return apiGet<PaginatedResponse<AdminUserListItem>>(buildAdminUsersListPath(normalized));
}

export function adminUsersListQueryOptions(params: AdminUsersListParams = {}) {
  const normalized = normalizeAdminUsersListParams(params);
  return queryOptions({
    queryKey: adminUsersListKey(params),
    queryFn: () => fetchAdminUsersList(normalized),
  });
}

export function useAdminUsersListQuery(params: AdminUsersListParams = {}) {
  return useQuery(adminUsersListQueryOptions(params));
}

function updateAdminUsersListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: ReturnType<typeof adminUserKeys.list>,
  updater: (users: AdminUserListItem[]) => AdminUserListItem[]
) {
  queryClient.setQueryData<PaginatedResponse<AdminUserListItem>>(listKey, (current) => {
    if (!current) return current;
    return { ...current, data: updater(current.data) };
  });
}

interface AdminUsersListMutationContext {
  previous?: PaginatedResponse<AdminUserListItem>;
  listKey: ReturnType<typeof adminUserKeys.list>;
}

export function buildAdminUserForceLogoutPath(id: string): string {
  return `/admin/users/${id}/force-logout`;
}

export function buildAdminUserSegmentPath(id: string): string {
  return `/admin/users/${id}/segment`;
}

export function fetchAdminUserDetail(id: string): Promise<AdminUserDetail> {
  return apiGet<AdminUserDetail>(buildAdminUserDetailPath(id));
}

export function adminUserDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: adminUserKeys.detail(id),
    queryFn: () => fetchAdminUserDetail(id),
    enabled: Boolean(id),
  });
}

export function useAdminUserDetailQuery(id: string) {
  return useQuery(adminUserDetailQueryOptions(id));
}

function updateAdminUserDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  detailKey: ReturnType<typeof adminUserKeys.detail>,
  updater: (user: AdminUserDetail) => AdminUserDetail
) {
  queryClient.setQueryData<AdminUserDetail>(detailKey, (current) =>
    current ? updater(current) : current
  );
}

interface DetailMutationContext {
  previous?: AdminUserDetail;
  detailKey: ReturnType<typeof adminUserKeys.detail>;
}

export function useUpdateAdminUserStatusMutation(userId: string) {
  const queryClient = useQueryClient();
  const detailKey = adminUserKeys.detail(userId);

  return useMutation<AdminUserDetail, Error, AdminUserStatus, DetailMutationContext>({
    mutationFn: (status) => apiPatch<AdminUserDetail>(buildAdminUserDetailPath(userId), { status }),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<AdminUserDetail>(detailKey);
      updateAdminUserDetailCache(queryClient, detailKey, (user) => ({ ...user, status }));
      return { previous, detailKey };
    },
    onError: (_error, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.detailKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.list() });
    },
  });
}

export function useSetAdminUserSegmentMutation(userId: string) {
  const queryClient = useQueryClient();
  const detailKey = adminUserKeys.detail(userId);

  return useMutation<AdminUserDetail, Error, CustomerSegment, DetailMutationContext>({
    mutationFn: (segment) =>
      apiPut<AdminUserDetail>(buildAdminUserSegmentPath(userId), { segment }),
    onMutate: async (segment) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<AdminUserDetail>(detailKey);
      updateAdminUserDetailCache(queryClient, detailKey, (user) => ({
        ...user,
        customerSegment: segment,
      }));
      return { previous, detailKey };
    },
    onError: (_error, _segment, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.detailKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
    },
  });
}

export function useForceLogoutAdminUserMutation(userId: string) {
  const queryClient = useQueryClient();
  const detailKey = adminUserKeys.detail(userId);

  return useMutation<{ success: boolean }, Error, void, DetailMutationContext>({
    mutationFn: () => apiPost<{ success: boolean }>(buildAdminUserForceLogoutPath(userId), {}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<AdminUserDetail>(detailKey);
      updateAdminUserDetailCache(queryClient, detailKey, (user) => ({
        ...user,
        activeSessions: 0,
        sessionsCount: 0,
      }));
      return { previous, detailKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.detailKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
    },
  });
}

export function useDeleteAdminUserMutation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, void>({
    mutationFn: () => apiDelete(buildAdminUserDetailPath(userId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.list() });
      void queryClient.removeQueries({ queryKey: adminUserKeys.detail(userId) });
    },
  });
}

export function useAdminUserListStatusMutation(params: AdminUsersListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = adminUsersListKey(params);

  return useMutation<
    AdminUserDetail,
    Error,
    UpdateAdminUserListStatusInput,
    AdminUsersListMutationContext
  >({
    mutationFn: ({ id, status }) =>
      apiPatch<AdminUserDetail>(buildAdminUserDetailPath(id), { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PaginatedResponse<AdminUserListItem>>(listKey);
      updateAdminUsersListCache(queryClient, listKey, (users) =>
        users.map((user) => (user.id === id ? { ...user, status } : user))
      );
      return { previous, listKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.list() });
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(id) });
    },
  });
}

export function useAdminUserListDeleteMutation(params: AdminUsersListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = adminUsersListKey(params);

  return useMutation<unknown, Error, string, AdminUsersListMutationContext>({
    mutationFn: (id) => apiDelete(buildAdminUserDetailPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PaginatedResponse<AdminUserListItem>>(listKey);
      updateAdminUsersListCache(queryClient, listKey, (users) =>
        users.filter((user) => user.id !== id)
      );
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.list() });
      void queryClient.removeQueries({ queryKey: adminUserKeys.detail(id) });
    },
  });
}
