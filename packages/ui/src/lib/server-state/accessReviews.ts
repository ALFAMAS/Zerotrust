"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AccessReview,
  AccessReviewDecision,
  AccessReviewDetailResponse,
  AccessReviewItem,
  AccessReviewsListResponse,
  PaginatedResponse,
  StartAccessReviewResponse,
} from "./types";

export const accessReviewKeys = queryKeys.admin.accessReviews;

export const ACCESS_REVIEWS_PATH = "/admin/access-reviews";

export function buildAccessReviewDetailPath(id: string): string {
  return `${ACCESS_REVIEWS_PATH}/${id}`;
}

export function buildAccessReviewItemPath(reviewId: string, itemId: string): string {
  return `${ACCESS_REVIEWS_PATH}/${reviewId}/items/${itemId}`;
}

export function buildAccessReviewCompletePath(id: string): string {
  return `${ACCESS_REVIEWS_PATH}/${id}/complete`;
}

function normalizeAccessReviewsList(data: unknown): AccessReviewsListResponse {
  if (data && typeof data === "object" && "reviews" in data) {
    const typed = data as AccessReviewsListResponse;
    if (Array.isArray(typed.reviews)) return typed;
  }
  const paginated = data as PaginatedResponse<AccessReview>;
  return { reviews: paginated.data ?? [] };
}

function normalizeAccessReviewDetail(data: unknown): AccessReviewDetailResponse {
  const raw = data as AccessReviewDetailResponse & {
    items?: AccessReviewItem[] | PaginatedResponse<AccessReviewItem>;
  };
  const items = Array.isArray(raw.items) ? raw.items : (raw.items?.data ?? []);
  return { review: raw.review, items };
}

export function fetchAccessReviewsList(): Promise<AccessReviewsListResponse> {
  return apiGet<unknown>(ACCESS_REVIEWS_PATH).then(normalizeAccessReviewsList);
}

export function fetchAccessReviewDetail(id: string): Promise<AccessReviewDetailResponse> {
  return apiGet<unknown>(buildAccessReviewDetailPath(id)).then(normalizeAccessReviewDetail);
}

export function accessReviewsListQueryOptions() {
  return queryOptions({
    queryKey: accessReviewKeys.list(),
    queryFn: fetchAccessReviewsList,
  });
}

export function accessReviewDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: accessReviewKeys.detail(id),
    queryFn: () => fetchAccessReviewDetail(id),
    enabled: Boolean(id),
  });
}

export function useAccessReviewsListQuery() {
  return useQuery(accessReviewsListQueryOptions());
}

export function useAccessReviewDetailQuery(id: string) {
  return useQuery(accessReviewDetailQueryOptions(id));
}

export function useStartAccessReviewMutation() {
  const queryClient = useQueryClient();
  const listKey = accessReviewKeys.list();

  return useMutation<StartAccessReviewResponse, Error, void>({
    mutationFn: () => apiPost<StartAccessReviewResponse>(ACCESS_REVIEWS_PATH, {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

interface DecideItemInput {
  reviewId: string;
  itemId: string;
  decision: AccessReviewDecision;
}

interface DecideItemMutationContext {
  previous?: AccessReviewDetailResponse;
  detailKey: ReturnType<typeof accessReviewKeys.detail>;
}

export function useDecideAccessReviewItemMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, DecideItemInput, DecideItemMutationContext>({
    mutationFn: ({ reviewId, itemId, decision }) =>
      apiPatch(buildAccessReviewItemPath(reviewId, itemId), { decision }),
    onMutate: async ({ reviewId, itemId, decision }) => {
      const detailKey = accessReviewKeys.detail(reviewId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<AccessReviewDetailResponse>(detailKey);
      queryClient.setQueryData<AccessReviewDetailResponse>(detailKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === itemId ? { ...item, decision, decidedAt: new Date().toISOString() } : item
          ),
        };
      });
      return { previous, detailKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.detailKey, context.previous);
      }
    },
    onSettled: (_data, _error, { reviewId }) => {
      void queryClient.invalidateQueries({ queryKey: accessReviewKeys.detail(reviewId) });
      void queryClient.invalidateQueries({ queryKey: accessReviewKeys.list() });
    },
  });
}

export function useCompleteAccessReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiPost(buildAccessReviewCompletePath(id), {}),
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: accessReviewKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: accessReviewKeys.list() });
    },
  });
}
