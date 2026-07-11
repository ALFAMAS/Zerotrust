"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { brand } from "@/config/brand";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { StatusData, StatusHistoryResponse } from "./types";

export const statusKeys = queryKeys.status;

export const STATUS_PATH = "/status";
export const STATUS_HISTORY_PATH = "/status/history";
export const STATUS_STREAM_PATH = "/status/stream";

const API_URL = brand.apiUrl;

export function fetchStatus(): Promise<StatusData> {
  return apiGet<StatusData>(STATUS_PATH, { skipAuth: true });
}

export function fetchStatusHistory(days = 90): Promise<StatusHistoryResponse> {
  return apiGet<StatusHistoryResponse>(`${STATUS_HISTORY_PATH}?days=${days}`, { skipAuth: true });
}

export function statusHistoryQueryOptions(days = 90) {
  return queryOptions({
    queryKey: [...statusKeys.current(), "history", days] as const,
    queryFn: () => fetchStatusHistory(days),
    staleTime: 60_000,
  });
}

export function useStatusHistoryQuery(days = 90) {
  return useQuery(statusHistoryQueryOptions(days));
}

export function statusQueryOptions() {
  return queryOptions({
    queryKey: statusKeys.current(),
    queryFn: fetchStatus,
    staleTime: 30_000,
  });
}

export function useStatusQuery() {
  return useQuery(statusQueryOptions());
}

export function useStatusStream(enabled = true) {
  const queryClient = useQueryClient();
  const statusKey = statusKeys.current();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const es = new EventSource(`${API_URL}${STATUS_STREAM_PATH}`);
    es.onmessage = (e) => {
      try {
        const statusData = JSON.parse(e.data) as StatusData;
        queryClient.setQueryData(statusKey, statusData);
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [enabled, queryClient, statusKey]);
}
