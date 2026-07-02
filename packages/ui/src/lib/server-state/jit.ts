"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { JitRequest } from "./types";

export const jitKeys = queryKeys.jit;

export const INCOMING_JIT_REQUESTS_PATH = "/jit/cross-tenant/incoming";

export function fetchIncomingJitRequests(): Promise<JitRequest[]> {
  return apiGet<JitRequest[]>(INCOMING_JIT_REQUESTS_PATH).then((data) =>
    Array.isArray(data) ? data : []
  );
}

export function incomingJitRequestsQueryOptions() {
  return queryOptions({
    queryKey: jitKeys.incoming(),
    queryFn: fetchIncomingJitRequests,
  });
}

export function useIncomingJitRequestsQuery() {
  return useQuery(incomingJitRequestsQueryOptions());
}

export function useApproveJitRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<JitRequest, Error, string>({
    mutationFn: (id) => apiPost<JitRequest>(`/jit/cross-tenant/${id}/approve`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jitKeys.incoming() });
    },
  });
}

export function useDenyJitRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<JitRequest, Error, string>({
    mutationFn: (id) => apiPost<JitRequest>(`/jit/cross-tenant/${id}/deny`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jitKeys.incoming() });
    },
  });
}
