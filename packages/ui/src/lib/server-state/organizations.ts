"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { CreateOrganizationInput, OrganizationsListResponse } from "./types";

export const organizationKeys = queryKeys.organizations;

export const ORGS_PATH = "/orgs";

export function fetchOrganizationsList(): Promise<OrganizationsListResponse> {
  return apiGet<OrganizationsListResponse>(ORGS_PATH);
}

export function organizationsListQueryOptions() {
  return queryOptions({
    queryKey: organizationKeys.list(),
    queryFn: fetchOrganizationsList,
  });
}

export function useOrganizationsListQuery() {
  return useQuery(organizationsListQueryOptions());
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, CreateOrganizationInput>({
    mutationFn: (input) => apiPost(ORGS_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
  });
}
