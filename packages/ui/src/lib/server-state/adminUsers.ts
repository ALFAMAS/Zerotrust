"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AdminUserDetail, AdminUserStatus, CustomerSegment } from "./types";

export const adminUserKeys = queryKeys.admin.users;

export const CUSTOMER_SEGMENTS: CustomerSegment[] = [
  "champion",
  "at_risk",
  "expansion",
  "new",
];

export function buildAdminUserDetailPath(id: string): string {
  return `/admin/users/${id}`;
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
    mutationFn: (status) =>
      apiPatch<AdminUserDetail>(buildAdminUserDetailPath(userId), { status }),
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
    mutationFn: () => apiPost<{ success: boolean }>(buildAdminUserForceLogoutPath(userId)),
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
