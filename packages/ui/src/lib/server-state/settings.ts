"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AuthSettings, GeneralSettings } from "./types";

export const settingsKeys = queryKeys.settings;

export const ADMIN_SETTINGS_PATH = "/admin/settings";

export const GENERAL_SETTINGS_DEFAULTS: GeneralSettings = {
  appName: "",
  appUrl: "",
  supportEmail: "",
  logoUrl: "",
};

export const AUTH_SETTINGS_DEFAULTS: AuthSettings = {
  emailPasswordEnabled: true,
  googleOAuthEnabled: false,
  githubOAuthEnabled: false,
  magicLinkEnabled: false,
  passkeyEnabled: false,
  totpEnabled: false,
  emailOtpEnabled: false,
  smsOtpEnabled: false,
  requireMfaForAll: false,
  sessionTTLSeconds: 3600,
  maxConcurrentSessions: 5,
  accountLockoutEnabled: true,
  accountLockoutThreshold: 5,
  accountLockoutDurationMinutes: 15,
  registrationEnabled: true,
  requireEmailVerification: true,
  allowedEmailDomains: "",
};

export function normalizeGeneralSettings(
  partial: Partial<GeneralSettings> = {}
): GeneralSettings {
  return { ...GENERAL_SETTINGS_DEFAULTS, ...partial };
}

export function normalizeAuthSettings(partial: Partial<AuthSettings> & { allowedEmailDomains?: string | string[] } = {}): AuthSettings {
  const domains = partial.allowedEmailDomains;
  const allowedEmailDomains = Array.isArray(domains)
    ? domains.join(", ")
    : (domains ?? AUTH_SETTINGS_DEFAULTS.allowedEmailDomains);
  return {
    ...AUTH_SETTINGS_DEFAULTS,
    ...partial,
    allowedEmailDomains,
  };
}

function serializeAuthSettingsForSave(settings: AuthSettings): Record<string, unknown> {
  return {
    ...settings,
    allowedEmailDomains: settings.allowedEmailDomains,
  };
}

export function fetchAdminSettings(): Promise<GeneralSettings> {
  return apiGet<Partial<GeneralSettings>>(ADMIN_SETTINGS_PATH).then(normalizeGeneralSettings);
}

export function fetchAdminAuthSettings(): Promise<AuthSettings> {
  return apiGet<Partial<AuthSettings> & { allowedEmailDomains?: string | string[] }>(
    ADMIN_SETTINGS_PATH
  ).then(normalizeAuthSettings);
}

export function adminSettingsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.general(),
    queryFn: fetchAdminSettings,
  });
}

export function useAdminSettingsQuery() {
  return useQuery(adminSettingsQueryOptions());
}

export function adminAuthSettingsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.auth(),
    queryFn: fetchAdminAuthSettings,
  });
}

export function useAdminAuthSettingsQuery() {
  return useQuery(adminAuthSettingsQueryOptions());
}

export function useSaveAdminSettingsMutation() {
  const queryClient = useQueryClient();
  const settingsKey = settingsKeys.general();

  return useMutation<GeneralSettings, Error, GeneralSettings>({
    mutationFn: (settings) =>
      apiPut<Partial<GeneralSettings>>(ADMIN_SETTINGS_PATH, settings).then(
        normalizeGeneralSettings
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKey, updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useSaveAdminAuthSettingsMutation() {
  const queryClient = useQueryClient();
  const authKey = settingsKeys.auth();

  return useMutation<AuthSettings, Error, AuthSettings>({
    mutationFn: (settings) =>
      apiPut<Partial<AuthSettings> & { allowedEmailDomains?: string | string[] }>(
        ADMIN_SETTINGS_PATH,
        serializeAuthSettingsForSave(settings)
      ).then(normalizeAuthSettings),
    onSuccess: (updated) => {
      queryClient.setQueryData(authKey, updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
