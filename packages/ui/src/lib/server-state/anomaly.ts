"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AnomalyBaseline,
  AnomalyBaselinesListParams,
  AnomalySignals,
  PaginatedResponse,
  ScoreLoginInput,
} from "./types";

const DEFAULT_LIST_LIMIT = 100;

export const anomalyKeys = queryKeys.anomaly;

export const ANOMALY_BASELINES_PATH = "/admin/anomaly/baselines";

export function buildAnomalyBaselinesPath(params: AnomalyBaselinesListParams = {}): string {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.page !== undefined) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `${ANOMALY_BASELINES_PATH}?${qs}` : ANOMALY_BASELINES_PATH;
}

export function normalizeAnomalyBaselinesListParams(
  params: AnomalyBaselinesListParams = {}
): Required<Pick<AnomalyBaselinesListParams, "limit">> & AnomalyBaselinesListParams {
  return { limit: params.limit ?? DEFAULT_LIST_LIMIT, ...params };
}

export function fetchAnomalyBaselines(
  params: AnomalyBaselinesListParams = {}
): Promise<PaginatedResponse<AnomalyBaseline>> {
  const normalized = normalizeAnomalyBaselinesListParams(params);
  return apiGet<PaginatedResponse<AnomalyBaseline>>(buildAnomalyBaselinesPath(normalized));
}

export function anomalyBaselinesQueryOptions(params: AnomalyBaselinesListParams = {}) {
  const normalized = normalizeAnomalyBaselinesListParams(params);
  return queryOptions({
    queryKey: anomalyKeys.baselines(normalized),
    queryFn: () => fetchAnomalyBaselines(normalized),
  });
}

export function useAnomalyBaselinesQuery(params: AnomalyBaselinesListParams = {}) {
  return useQuery(anomalyBaselinesQueryOptions(params));
}

function updateBaselinesCache(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: ReturnType<typeof anomalyKeys.baselines>,
  updater: (baselines: AnomalyBaseline[]) => AnomalyBaseline[]
) {
  queryClient.setQueryData<PaginatedResponse<AnomalyBaseline>>(listKey, (current) => {
    if (!current) return current;
    return { ...current, data: updater(current.data ?? []) };
  });
}

interface BaselinesMutationContext {
  previous?: PaginatedResponse<AnomalyBaseline>;
  listKey: ReturnType<typeof anomalyKeys.baselines>;
}

export function useResetBaselineMutation(params: AnomalyBaselinesListParams = {}) {
  const queryClient = useQueryClient();
  const listKey = anomalyKeys.baselines(normalizeAnomalyBaselinesListParams(params));

  return useMutation<{ success: boolean }, Error, string, BaselinesMutationContext>({
    mutationFn: (userId) => apiDelete(`/admin/anomaly/baseline/${userId}`),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PaginatedResponse<AnomalyBaseline>>(listKey);
      updateBaselinesCache(queryClient, listKey, (baselines) =>
        baselines.filter((baseline) => baseline.userId !== userId)
      );
      return { previous, listKey };
    },
    onError: (_error, _userId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: anomalyKeys.baselines() });
    },
  });
}

export function useScoreLoginMutation() {
  return useMutation<AnomalySignals, Error, ScoreLoginInput>({
    mutationFn: (input) => apiPost<AnomalySignals>("/admin/anomaly/score", input),
  });
}
