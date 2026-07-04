"use client";

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/apiClient";

export const FEEDBACK_PATH = "/feedback";

export interface SubmitFeedbackInput {
  type: "nps" | "thumbs";
  score: number;
  comment?: string;
  context?: string;
}

export function useSubmitFeedbackMutation() {
  return useMutation<unknown, Error, SubmitFeedbackInput>({
    mutationFn: (input) => apiPost(FEEDBACK_PATH, input),
  });
}
