"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  ChangeTenantPlanInput,
  CreateTenantInput,
  Tenant,
  TenantsListParams,
  TenantsResponse,
  UpdateTenantStatusInput,
} from "./types";

const DEFAULT_LIST_LIMIT = 100;

export const tenantKeys = queryKeys.tenants;

export function buildTenantsListPath(params: TenantsListParams = {}): string {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.status) search.set("status", params.status);
  if (params.plan) search.set("plan", params.plan);
  const qs = search.toString();
  return qs ? `/admin/tenants?${qs}` : "/admin/tenants";
}

export function normalizeTenantsListParams(
  params: TenantsListParams = {}
): Required<Pick<TenantsListParams, "limit">> & TenantsListParams {
  return { limit: params.limit ?? DEFAULT_LIST_LIMIT, ...params };
}

export function fetchTenants(params: TenantsListParams = {}): Promise<TenantsResponse> {
  const normalized = normalizeTenantsListParams(params);
  return apiGet<TenantsResponse>(buildTenantsListPath(normalized));
}

export function tenantsListQueryOptions(params: TenantsListParams = {}) {
  const normalized = normalizeTenantsListParams(params);
  return queryOptions({
    queryKey: tenantKeys.list(normalized),
    queryFn: () => fetchTenants(normalized),
  });
}

export function useTenantsQuery(params: TenantsListParams = {}) {
  return useQuery(tenantsListQueryOptions(params));
}

function updateTenantsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: ReturnType<typeof tenantKeys.list>,
  updater: (tenants: Tenant[]) => Tenant[]
) {
  queryClient.setQueryData<TenantsResponse>(listKey, (current) => {
    if (!current) return current;
    return { ...current, tenants: updater(current.tenants) };
  });
}

interface TenantsListMutationContext {
  previous?: TenantsResponse;
  listKey: ReturnType<typeof tenantKeys.list>;
}

export function useCreateTenantMutation(params: TenantsListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = tenantKeys.list(normalizeTenantsListParams(params));

  return useMutation<Tenant, Error, CreateTenantInput>({
    mutationFn: (input) => apiPost<Tenant>("/admin/tenants", input),
    onSuccess: (created) => {
      updateTenantsCache(queryClient, listKey, (tenants) => [created, ...tenants]);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
    },
  });
}

export function useChangeTenantPlanMutation(params: TenantsListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = tenantKeys.list(normalizeTenantsListParams(params));

  return useMutation<Tenant, Error, ChangeTenantPlanInput, TenantsListMutationContext>({
    mutationFn: ({ id, plan }) => apiPost<Tenant>(`/admin/tenants/${id}/plan`, { plan }),
    onMutate: async ({ id, plan }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<TenantsResponse>(listKey);
      updateTenantsCache(queryClient, listKey, (tenants) =>
        tenants.map((tenant) => (tenant.id === id ? { ...tenant, plan } : tenant))
      );
      return { previous, listKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
    },
  });
}

export function useUpdateTenantStatusMutation(params: TenantsListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = tenantKeys.list(normalizeTenantsListParams(params));

  return useMutation<Tenant, Error, UpdateTenantStatusInput, TenantsListMutationContext>({
    mutationFn: ({ id, status }) => apiPut<Tenant>(`/admin/tenants/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<TenantsResponse>(listKey);
      updateTenantsCache(queryClient, listKey, (tenants) =>
        tenants.map((tenant) => (tenant.id === id ? { ...tenant, status } : tenant))
      );
      return { previous, listKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
    },
  });
}

export function useDeleteTenantMutation(params: TenantsListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = tenantKeys.list(normalizeTenantsListParams(params));

  return useMutation<unknown, Error, string, TenantsListMutationContext>({
    mutationFn: (id) => apiDelete(`/admin/tenants/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<TenantsResponse>(listKey);
      updateTenantsCache(queryClient, listKey, (tenants) =>
        tenants.filter((tenant) => tenant.id !== id)
      );
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
      void queryClient.removeQueries({ queryKey: tenantKeys.detail(id) });
    },
  });
}
