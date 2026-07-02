"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { ApiKey, CreateApiKeyInput, CreateApiKeyResponse } from "./types";

export const apiKeyKeys = queryKeys.apiKeys;

export const API_KEYS_PATH = "/api-keys";

export function buildApiKeyPath(id: string): string {
  return `${API_KEYS_PATH}/${id}`;
}

export function fetchApiKeysList(): Promise<ApiKey[]> {
  return apiGet<ApiKey[]>(API_KEYS_PATH);
}

export function apiKeysListQueryOptions() {
  return queryOptions({
    queryKey: apiKeyKeys.list(),
    queryFn: fetchApiKeysList,
  });
}

export function useApiKeysListQuery() {
  return useQuery(apiKeysListQueryOptions());
}

interface RevokeApiKeyMutationContext {
  previous?: ApiKey[];
  listKey: ReturnType<typeof apiKeyKeys.list>;
}

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation<CreateApiKeyResponse, Error, CreateApiKeyInput>({
    mutationFn: (input) => apiPost<CreateApiKeyResponse>(API_KEYS_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() });
    },
  });
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  const listKey = apiKeyKeys.list();

  return useMutation<unknown, Error, string, RevokeApiKeyMutationContext>({
    mutationFn: (id) => apiDelete(buildApiKeyPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ApiKey[]>(listKey);
      queryClient.setQueryData<ApiKey[]>(listKey, (current) =>
        current ? current.filter((key) => key.id !== id) : current
      );
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() });
    },
  });
}
