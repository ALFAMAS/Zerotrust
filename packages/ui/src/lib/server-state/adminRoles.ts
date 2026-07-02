"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";

export interface SystemRole {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  permissions: string[];
  parentRoleId: string | null;
  isSystem: boolean;
  createdAt: string;
}

export interface CreateRoleInput {
  name: string;
  displayName: string;
  description?: string;
  parentRoleName?: string;
  permissions?: string[];
}

export const adminRolesKeys = queryKeys.admin.roles;

export function fetchAdminRoles(): Promise<{ roles: SystemRole[] }> {
  return apiGet<{ roles: SystemRole[] }>("/admin/roles");
}

export function adminRolesQueryOptions() {
  return queryOptions({
    queryKey: adminRolesKeys.list(),
    queryFn: fetchAdminRoles,
  });
}

export function useAdminRolesQuery() {
  return useQuery(adminRolesQueryOptions());
}

export function useCreateAdminRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation<SystemRole, Error, CreateRoleInput>({
    mutationFn: (input) => apiPost<{ role: SystemRole }>("/admin/roles", input).then((r) => r.role),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminRolesKeys.list() });
    },
  });
}
