"use client";

import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { RegionHealth, SetOrgRegionInput } from "./types";

export const regionKeys = queryKeys.regions;

export const REGION_HEALTH_PATH = "/regions/health";

export function buildOrgRegionPath(orgId: string): string {
  return `/regions/orgs/${orgId}/region`;
}

export function fetchRegionHealth(): Promise<RegionHealth> {
  return apiGet<RegionHealth>(REGION_HEALTH_PATH);
}

export function regionHealthQueryOptions() {
  return queryOptions({
    queryKey: regionKeys.health(),
    queryFn: fetchRegionHealth,
  });
}

export function useRegionHealthQuery() {
  return useQuery(regionHealthQueryOptions());
}

interface SetOrgRegionVariables {
  orgId: string;
  input: SetOrgRegionInput;
}

export function useSetOrgRegionMutation() {
  return useMutation<unknown, Error, SetOrgRegionVariables>({
    mutationFn: ({ orgId, input }) => apiPut(buildOrgRegionPath(orgId), input),
  });
}
