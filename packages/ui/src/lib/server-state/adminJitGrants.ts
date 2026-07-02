"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";

export interface AdminJitGrant {
  id: string;
  userId: string;
  roleId: string;
  reason: string;
  status: string;
  requestedAt: string;
  expiresAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface AdminJitGrantsParams {
  status?: string;
}

export const adminJitGrantsKeys = queryKeys.admin.jitGrants;

export function buildAdminJitGrantsPath(params: AdminJitGrantsParams = {}): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return qs ? `/admin/jit-grants?${qs}` : "/admin/jit-grants";
}

export function fetchAdminJitGrants(
  params: AdminJitGrantsParams = {}
): Promise<{ grants: AdminJitGrant[] }> {
  return apiGet<{ grants: AdminJitGrant[] }>(buildAdminJitGrantsPath(params));
}

export function adminJitGrantsQueryOptions(params: AdminJitGrantsParams = {}) {
  return queryOptions({
    queryKey: adminJitGrantsKeys.list(params as Record<string, string | number | undefined>),
    queryFn: () => fetchAdminJitGrants(params),
  });
}

export function useAdminJitGrantsQuery(params: AdminJitGrantsParams = {}) {
  return useQuery(adminJitGrantsQueryOptions(params));
}

export function useApproveAdminJitGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiPost(`/admin/jit-grants/${id}/approve`, {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminJitGrantsKeys.all() });
    },
  });
}

export function useDenyAdminJitGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiPost(`/admin/jit-grants/${id}/deny`, {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminJitGrantsKeys.all() });
    },
  });
}

export function useRevokeAdminJitGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiDelete(`/admin/jit-grants/${id}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminJitGrantsKeys.all() });
    },
  });
}
