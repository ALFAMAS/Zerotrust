"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { CreateJitRequestInput, JitRequest } from "./types";

export const jitKeys = queryKeys.jit;

export const INCOMING_JIT_REQUESTS_PATH = "/jit/cross-tenant/incoming";
export const MY_JIT_REQUESTS_PATH = "/jit/cross-tenant";

export function fetchIncomingJitRequests(): Promise<JitRequest[]> {
  return apiGet<JitRequest[]>(INCOMING_JIT_REQUESTS_PATH).then((data) =>
    Array.isArray(data) ? data : []
  );
}

export function fetchMyJitRequests(): Promise<JitRequest[]> {
  return apiGet<JitRequest[]>(MY_JIT_REQUESTS_PATH).then((data) =>
    Array.isArray(data) ? data : []
  );
}

export function incomingJitRequestsQueryOptions() {
  return queryOptions({
    queryKey: jitKeys.incoming(),
    queryFn: fetchIncomingJitRequests,
  });
}

export function myJitRequestsQueryOptions() {
  return queryOptions({
    queryKey: jitKeys.myRequests(),
    queryFn: fetchMyJitRequests,
  });
}

export function useIncomingJitRequestsQuery() {
  return useQuery(incomingJitRequestsQueryOptions());
}

export function useMyJitRequestsQuery() {
  return useQuery(myJitRequestsQueryOptions());
}

export function useApproveJitRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<JitRequest, Error, string>({
    mutationFn: (id) => apiPost<JitRequest>(`/jit/cross-tenant/${id}/approve`, {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jitKeys.incoming() });
    },
  });
}

export function useDenyJitRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<JitRequest, Error, string>({
    mutationFn: (id) => apiPost<JitRequest>(`/jit/cross-tenant/${id}/deny`, {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jitKeys.incoming() });
    },
  });
}

export function useSubmitJitRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation<JitRequest, Error, CreateJitRequestInput>({
    mutationFn: (input) => apiPost<JitRequest>(MY_JIT_REQUESTS_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jitKeys.myRequests() });
    },
  });
}
