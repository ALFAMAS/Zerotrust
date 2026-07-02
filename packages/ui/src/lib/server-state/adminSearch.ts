"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";

export type SearchIndexType = "user" | "org" | "ticket";

export interface SearchProviderInfo {
  provider: string;
}

export interface IndexDocumentInput {
  id: string;
  type: SearchIndexType;
  orgId: string;
  title: string;
  content?: string;
  region?: "us" | "eu" | "apac";
}

export const adminSearchKeys = queryKeys.admin.searchIndex;

export function fetchSearchProvider(): Promise<SearchProviderInfo> {
  return apiGet<SearchProviderInfo>("/search/provider");
}

export function searchProviderQueryOptions() {
  return queryOptions({
    queryKey: adminSearchKeys.provider(),
    queryFn: fetchSearchProvider,
  });
}

export function useSearchProviderQuery() {
  return useQuery(searchProviderQueryOptions());
}

export function useIndexDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, IndexDocumentInput>({
    mutationFn: (input) => apiPost("/search/index", input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminSearchKeys.provider() });
    },
  });
}

export function useDeleteIndexedDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { type: SearchIndexType; id: string }>({
    mutationFn: ({ type, id }) => apiDelete(`/search/index/${type}/${id}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminSearchKeys.provider() });
    },
  });
}
