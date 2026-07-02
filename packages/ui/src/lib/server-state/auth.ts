"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPostFormData } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AuthMe,
  ConnectedProviders,
  OAuthProvider,
  PatchAuthMeInput,
  TotpSetupResponse,
  TotpVerifyResponse,
} from "./types";

export const authKeys = queryKeys.auth;

export const AUTH_ME_PATH = "/auth/me";
export const AUTH_ME_AVATAR_PATH = "/auth/me/avatar";
export const VERIFY_EMAIL_RESEND_PATH = "/auth/verify-email/resend";
export const ONBOARDING_COMPLETE_PATH = "/auth/me/onboarding-complete";
export const OAUTH_PROVIDERS_PATH = "/auth/oauth/providers";
export const TOTP_PATH = "/auth/mfa/totp";
export const TOTP_SETUP_PATH = "/auth/mfa/totp/setup";
export const TOTP_VERIFY_PATH = "/auth/mfa/totp/verify";
export const PASSKEY_REGISTER_OPTIONS_PATH = "/auth/passkey/register/options";
export const PASSKEY_REGISTER_VERIFY_PATH = "/auth/passkey/register/verify";

export function buildOAuthAuthorizePath(provider: string): string {
  return `/auth/oauth/${provider}/authorize`;
}

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
    mutationFn: () => apiPost(VERIFY_EMAIL_RESEND_PATH, {}),
  });
}

export function useOnboardingCompleteMutation() {
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost(ONBOARDING_COMPLETE_PATH, {}),
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

  return useMutation<unknown, Error, OAuthProvider | string>({
    mutationFn: (provider) => apiDelete(`/auth/oauth/${provider}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.oauthProviders() });
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useUploadAvatarMutation() {
  const queryClient = useQueryClient();
  const meKey = authKeys.me();

  return useMutation<{ avatarUrl: string }, Error, FormData>({
    mutationFn: (formData) => apiPostFormData<{ avatarUrl: string }>(AUTH_ME_AVATAR_PATH, formData),
    onSuccess: (result) => {
      queryClient.setQueryData(meKey, (current: AuthMe | undefined) =>
        current ? { ...current, avatarUrl: result.avatarUrl } : current
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useDisableTotpMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, void>({
    mutationFn: () => apiDelete(TOTP_PATH),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useSetupTotpMutation() {
  return useMutation<TotpSetupResponse, Error, void>({
    mutationFn: () => apiPost<TotpSetupResponse>(TOTP_SETUP_PATH, {}),
  });
}

export function useVerifyTotpMutation() {
  const queryClient = useQueryClient();

  return useMutation<TotpVerifyResponse, Error, { code: string }>({
    mutationFn: (input) => apiPost<TotpVerifyResponse>(TOTP_VERIFY_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function usePasskeyRegisterOptionsMutation() {
  return useMutation<Record<string, unknown>, Error, void>({
    mutationFn: () => apiPost<Record<string, unknown>>(PASSKEY_REGISTER_OPTIONS_PATH, {}),
  });
}

export function usePasskeyRegisterVerifyMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (attestation) => apiPost(PASSKEY_REGISTER_VERIFY_PATH, attestation),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useOAuthAuthorizeMutation() {
  return useMutation<{ authorizeUrl: string }, Error, string>({
    mutationFn: (provider) => apiGet<{ authorizeUrl: string }>(buildOAuthAuthorizePath(provider)),
  });
}
