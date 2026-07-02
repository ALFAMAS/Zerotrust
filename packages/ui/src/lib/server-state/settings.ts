"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { GeneralSettings } from "./types";

export const settingsKeys = queryKeys.settings;

export const ADMIN_SETTINGS_PATH = "/admin/settings";

export const GENERAL_SETTINGS_DEFAULTS: GeneralSettings = {
  appName: "",
  appUrl: "",
  supportEmail: "",
  logoUrl: "",
};

export function normalizeGeneralSettings(
  partial: Partial<GeneralSettings> = {}
): GeneralSettings {
  return { ...GENERAL_SETTINGS_DEFAULTS, ...partial };
}

export function fetchAdminSettings(): Promise<GeneralSettings> {
  return apiGet<Partial<GeneralSettings>>(ADMIN_SETTINGS_PATH).then(normalizeGeneralSettings);
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
