"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AuthMe, ConnectedProviders, OAuthProvider, PatchAuthMeInput } from "./types";

export const authKeys = queryKeys.auth;

export const AUTH_ME_PATH = "/auth/me";
export const VERIFY_EMAIL_RESEND_PATH = "/auth/verify-email/resend";
export const ONBOARDING_COMPLETE_PATH = "/auth/me/onboarding-complete";
export const OAUTH_PROVIDERS_PATH = "/auth/oauth/providers";

export function fetchAuthMe(): Promise<AuthMe> {
  return apiGet<AuthMe>(AUTH_ME_PATH);
}

export function authMeQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: authKeys.me(),
    queryFn: fetchAuthMe,
    enabled,
  });
}

export function useAuthMeQuery(enabled = true) {
  return useQuery(authMeQueryOptions(enabled));
}

export function usePatchAuthMeMutation() {
  const queryClient = useQueryClient();
  const meKey = authKeys.me();

  return useMutation<AuthMe, Error, PatchAuthMeInput>({
    mutationFn: (input) => apiPatch<AuthMe>(AUTH_ME_PATH, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(meKey, (current: AuthMe | undefined) =>
        current ? { ...current, ...updated } : updated
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useResendVerificationEmailMutation() {
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(VERIFY_EMAIL_RESEND_PATH),
  });
}

export function useOnboardingCompleteMutation() {
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(ONBOARDING_COMPLETE_PATH),
  });
}

export function fetchOAuthProviders(): Promise<ConnectedProviders> {
  return apiGet<ConnectedProviders>(OAUTH_PROVIDERS_PATH);
}

export function oauthProvidersQueryOptions() {
  return queryOptions({
    queryKey: authKeys.oauthProviders(),
    queryFn: fetchOAuthProviders,
  });
}

export function useOAuthProvidersQuery() {
  return useQuery(oauthProvidersQueryOptions());
}

export function useDisconnectOAuthProviderMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, OAuthProvider>({
    mutationFn: (provider) => apiDelete(`/auth/oauth/${provider}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.oauthProviders() });
    },
  });
}
