"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function buildOrgBrandingPath(orgId: string): string {
  return `/regions/orgs/${orgId}/branding`;
}

export function buildOrgDomainPath(orgId: string): string {
  return `/regions/orgs/${orgId}/domain`;
}

export interface OrgBranding {
  appName?: string;
  brandColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  hidePoweredBy?: boolean;
  emailFromAddress?: string;
  emailDomain?: string;
  customLoginUrl?: string;
}

export function fetchOrgBranding(orgId: string): Promise<OrgBranding> {
  return apiGet<OrgBranding>(buildOrgBrandingPath(orgId));
}

export function orgBrandingQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: regionKeys.branding(orgId),
    queryFn: () => fetchOrgBranding(orgId),
    enabled: Boolean(orgId),
  });
}

export function useOrgBrandingQuery(orgId: string) {
  return useQuery(orgBrandingQueryOptions(orgId));
}

export function useUpdateOrgBrandingMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { orgId: string; branding: OrgBranding }>({
    mutationFn: ({ orgId, branding }) => apiPut(buildOrgBrandingPath(orgId), branding),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: regionKeys.branding(variables.orgId) });
    },
  });
}

export function useSetOrgDomainMutation() {
  return useMutation<unknown, Error, { orgId: string; domain: string | null }>({
    mutationFn: ({ orgId, domain }) => apiPut(buildOrgDomainPath(orgId), { domain }),
  });
}

export function useSetOrgRegionMutation() {
  return useMutation<unknown, Error, SetOrgRegionVariables>({
    mutationFn: ({ orgId, input }) => apiPut(buildOrgRegionPath(orgId), input),
  });
}
