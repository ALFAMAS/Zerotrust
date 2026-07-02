"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { PaginatedResponse } from "./types";

export interface FeedbackEntry {
  id: string;
  userId: string | null;
  orgId: string | null;
  type: string;
  score: number | null;
  comment: string | null;
  context: string | null;
  createdAt: string;
}

export interface FeedbackListParams {
  page?: number;
  limit?: number;
  type?: string;
}

export const adminFeedbackKeys = queryKeys.admin.feedback;

export function buildFeedbackListPath(params: FeedbackListParams = {}): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.type) search.set("type", params.type);
  const qs = search.toString();
  return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
}

export function fetchAdminFeedback(
  params: FeedbackListParams = {}
): Promise<PaginatedResponse<FeedbackEntry>> {
  return apiGet<PaginatedResponse<FeedbackEntry>>(buildFeedbackListPath(params));
}

export function adminFeedbackQueryOptions(params: FeedbackListParams = {}) {
  return queryOptions({
    queryKey: adminFeedbackKeys.list(params as Record<string, string | number | undefined>),
    queryFn: () => fetchAdminFeedback(params),
  });
}

export function useAdminFeedbackQuery(params: FeedbackListParams = {}) {
  return useQuery(adminFeedbackQueryOptions(params));
}
