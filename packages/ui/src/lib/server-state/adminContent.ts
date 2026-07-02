"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPostFormData } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { PaginatedResponse } from "./types";

export interface FileAttachment {
  id: string;
  userId: string;
  orgId: string | null;
  feature: string;
  featureRecordId: string | null;
  fileName: string;
  fileSize: number;
  contentType: string;
  url: string;
  createdAt: string;
}

export interface AttachmentsListParams {
  page?: number;
  limit?: number;
  feature?: string;
}

export interface LifecycleEmailResult {
  sent: number;
  skipped: number;
  errors: number;
}

export const adminAttachmentsKeys = queryKeys.admin.attachments;

export function buildAttachmentsListPath(params: AttachmentsListParams = {}): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.feature) search.set("feature", params.feature);
  const qs = search.toString();
  return qs ? `/admin/attachments?${qs}` : "/admin/attachments";
}

export function fetchAdminAttachments(
  params: AttachmentsListParams = {}
): Promise<PaginatedResponse<FileAttachment>> {
  return apiGet<PaginatedResponse<FileAttachment>>(buildAttachmentsListPath(params));
}

export function adminAttachmentsQueryOptions(params: AttachmentsListParams = {}) {
  return queryOptions({
    queryKey: adminAttachmentsKeys.list(params as Record<string, string | number | undefined>),
    queryFn: () => fetchAdminAttachments(params),
  });
}

export function useAdminAttachmentsQuery(params: AttachmentsListParams = {}) {
  return useQuery(adminAttachmentsQueryOptions(params));
}

export function useUploadAdminAttachmentMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, FormData>({
    mutationFn: (formData) => apiPostFormData("/admin/attachments/upload", formData),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminAttachmentsKeys.all() });
    },
  });
}

export function useTriggerLifecycleEmailsMutation() {
  return useMutation<{ results: LifecycleEmailResult }, Error, void>({
    mutationFn: () => apiPost("/admin/lifecycle-emails", {}),
  });
}
