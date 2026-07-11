"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/apiClient";

export interface OrgFeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  metadata: Record<string, unknown>;
}

export function orgFeatureFlagsQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ["orgs", orgId, "feature-flags"] as const,
    queryFn: () => apiGet<{ flags: OrgFeatureFlag[] }>(`/orgs/${orgId}/feature-flags`),
  });
}

export function useOrgFeatureFlagsQuery(orgId: string) {
  return useQuery(orgFeatureFlagsQueryOptions(orgId));
}

export function useUpsertFeatureFlagMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; enabled: boolean; rolloutPercent?: number }) =>
      apiPut(`/orgs/${orgId}/feature-flags/${input.key}`, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "feature-flags"] });
    },
  });
}
