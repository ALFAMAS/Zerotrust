"use client";

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/apiClient";
import type {
  LoginResponse,
  LoginTokens,
  OAuthExchangeInput,
  PasskeyAuthOptionsInput,
  PasskeyAuthVerifyInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  SendMagicLinkInput,
  VerifyEmailInput,
  VerifyMagicLinkInput,
} from "./types";

export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_LOGIN_MFA_PATH = "/auth/login/mfa";
export const AUTH_REGISTER_PATH = "/auth/register";
export const AUTH_PASSWORD_RESET_REQUEST_PATH = "/auth/password-reset/request";
export const AUTH_PASSWORD_RESET_CONFIRM_PATH = "/auth/password-reset/confirm";
export const AUTH_VERIFY_EMAIL_PATH = "/auth/verify-email";
export const AUTH_MAGIC_LINK_SEND_PATH = "/auth/magic-link/send";
export const AUTH_MAGIC_LINK_VERIFY_PATH = "/auth/magic-link/verify";
export const AUTH_PASSKEY_AUTH_OPTIONS_PATH = "/auth/passkey/authenticate/options";
export const AUTH_PASSKEY_AUTH_VERIFY_PATH = "/auth/passkey/authenticate/verify";
export const AUTH_OAUTH_EXCHANGE_PATH = "/auth/oauth/exchange";

const PUBLIC_OPTS = { skipAuth: true } as const;

export function useLoginMutation() {
  return useMutation<LoginResponse, Error, { email: string; password: string }>({
    mutationFn: (input) => apiPost<LoginResponse>(AUTH_LOGIN_PATH, input, PUBLIC_OPTS),
  });
}

export function useLoginMfaMutation() {
  return useMutation<LoginTokens, Error, { mfaToken: string; code: string }>({
    mutationFn: (input) => apiPost<LoginTokens>(AUTH_LOGIN_MFA_PATH, input, PUBLIC_OPTS),
  });
}

export function useRegisterMutation() {
  return useMutation<unknown, Error, RegisterInput>({
    mutationFn: (input) => apiPost(AUTH_REGISTER_PATH, input, PUBLIC_OPTS),
  });
}

export function useRegisterAndLoginMutation() {
  return useMutation<LoginTokens, Error, RegisterInput>({
    mutationFn: async (input) => {
      await apiPost(AUTH_REGISTER_PATH, input, PUBLIC_OPTS);
      return apiPost<LoginTokens>(
        AUTH_LOGIN_PATH,
        { email: input.email, password: input.password },
        PUBLIC_OPTS
      );
    },
  });
}

export function usePasswordResetRequestMutation() {
  return useMutation<unknown, Error, PasswordResetRequestInput>({
    mutationFn: (input) =>
      apiPost(AUTH_PASSWORD_RESET_REQUEST_PATH, input, PUBLIC_OPTS).catch(() => undefined),
  });
}

export function usePasswordResetConfirmMutation() {
  return useMutation<unknown, Error, PasswordResetConfirmInput>({
    mutationFn: (input) => apiPost(AUTH_PASSWORD_RESET_CONFIRM_PATH, input, PUBLIC_OPTS),
  });
}

export function useVerifyEmailMutation() {
  return useMutation<unknown, Error, VerifyEmailInput>({
    mutationFn: (input) => apiPost(AUTH_VERIFY_EMAIL_PATH, input),
  });
}

export function useSendMagicLinkMutation() {
  return useMutation<unknown, Error, SendMagicLinkInput>({
    mutationFn: (input) => apiPost(AUTH_MAGIC_LINK_SEND_PATH, input, PUBLIC_OPTS),
  });
}

export function useVerifyMagicLinkMutation() {
  return useMutation<LoginTokens, Error, VerifyMagicLinkInput>({
    mutationFn: (input) => apiPost<LoginTokens>(AUTH_MAGIC_LINK_VERIFY_PATH, input, PUBLIC_OPTS),
  });
}

export function usePasskeyAuthOptionsMutation() {
  return useMutation<Record<string, unknown>, Error, PasskeyAuthOptionsInput>({
    mutationFn: (input) =>
      apiPost<Record<string, unknown>>(AUTH_PASSKEY_AUTH_OPTIONS_PATH, input, PUBLIC_OPTS),
  });
}

export function usePasskeyAuthVerifyMutation() {
  return useMutation<LoginTokens, Error, PasskeyAuthVerifyInput>({
    mutationFn: (input) => apiPost<LoginTokens>(AUTH_PASSKEY_AUTH_VERIFY_PATH, input, PUBLIC_OPTS),
  });
}

export function useOAuthExchangeMutation() {
  return useMutation<LoginTokens, Error, OAuthExchangeInput>({
    mutationFn: (input) => apiPost<LoginTokens>(AUTH_OAUTH_EXCHANGE_PATH, input, PUBLIC_OPTS),
  });
}
