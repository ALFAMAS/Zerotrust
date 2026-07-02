"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { StatusData } from "./types";

export const statusKeys = queryKeys.status;

export const STATUS_PATH = "/status";
export const STATUS_STREAM_PATH = "/status/stream";

const API_URL = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:3000";

export function fetchStatus(): Promise<StatusData> {
  return apiGet<StatusData>(STATUS_PATH, { skipAuth: true });
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
