"use client";

import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { NpsShouldPrompt, SubmitNpsInput } from "./types";

export const npsKeys = queryKeys.nps;

export const NPS_SHOULD_PROMPT_PATH = "/auth/me/nps/should-prompt";
export const NPS_SUBMIT_PATH = "/auth/me/nps";

export function fetchNpsShouldPrompt(): Promise<NpsShouldPrompt> {
  return apiGet<NpsShouldPrompt>(NPS_SHOULD_PROMPT_PATH);
}

export function npsShouldPromptQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: npsKeys.shouldPrompt(),
    queryFn: fetchNpsShouldPrompt,
    enabled,
  });
}

export function useNpsShouldPromptQuery(enabled = true) {
  return useQuery(npsShouldPromptQueryOptions(enabled));
}

export function useSubmitNpsMutation() {
  return useMutation<unknown, Error, SubmitNpsInput>({
    mutationFn: (input) => apiPost(NPS_SUBMIT_PATH, input),
  });
}
