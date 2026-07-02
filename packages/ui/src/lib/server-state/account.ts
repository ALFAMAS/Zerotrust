"use client";

import { useMutation } from "@tanstack/react-query";
import { apiDelete, apiGetBlob, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { GdprDeletionResponse } from "./types";

export const accountKeys = queryKeys.account;

export const GDPR_EXPORT_PATH = "/gdpr/export";
export const GDPR_ACCOUNT_PATH = "/gdpr/account";
export const GDPR_CANCEL_DELETION_PATH = "/gdpr/account/deletion/cancel";

export function useGdprExportMutation() {
  return useMutation<Blob, Error, void>({
    mutationFn: () => apiGetBlob(GDPR_EXPORT_PATH),
  });
}

export function useScheduleAccountDeletionMutation() {
  return useMutation<GdprDeletionResponse, Error, void>({
    mutationFn: () => apiDelete<GdprDeletionResponse>(GDPR_ACCOUNT_PATH),
  });
}

export function useCancelAccountDeletionMutation() {
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(GDPR_CANCEL_DELETION_PATH),
  });
}
