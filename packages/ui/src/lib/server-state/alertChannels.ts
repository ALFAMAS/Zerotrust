"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AlertChannel, AlertChannelsResponse, CreateAlertChannelInput } from "./types";

export const alertChannelKeys = queryKeys.admin.alertChannels;

export const ALERT_CHANNELS_PATH = "/admin/notifications/channels";

export function buildAlertChannelPath(id: string): string {
  return `${ALERT_CHANNELS_PATH}/${id}`;
}

export function buildAlertChannelTestPath(id: string): string {
  return `${ALERT_CHANNELS_PATH}/${id}/test`;
}

export function fetchAlertChannels(): Promise<AlertChannelsResponse> {
  return apiGet<AlertChannelsResponse>(ALERT_CHANNELS_PATH);
}

export function alertChannelsQueryOptions() {
  return queryOptions({
    queryKey: alertChannelKeys.list(),
    queryFn: fetchAlertChannels,
  });
}

export function useAlertChannelsQuery() {
  return useQuery(alertChannelsQueryOptions());
}

interface AlertChannelsMutationContext {
  previous?: AlertChannelsResponse;
  listKey: ReturnType<typeof alertChannelKeys.list>;
}

function updateAlertChannelsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: ReturnType<typeof alertChannelKeys.list>,
  updater: (channels: AlertChannel[]) => AlertChannel[]
) {
  queryClient.setQueryData<AlertChannelsResponse>(listKey, (current) => {
    if (!current) return current;
    return { ...current, channels: updater(current.channels ?? []) };
  });
}

export function useCreateAlertChannelMutation() {
  const queryClient = useQueryClient();
  const listKey = alertChannelKeys.list();

  return useMutation<AlertChannel, Error, CreateAlertChannelInput>({
    mutationFn: (input) => apiPost<AlertChannel>(ALERT_CHANNELS_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export function useToggleAlertChannelMutation() {
  const queryClient = useQueryClient();
  const listKey = alertChannelKeys.list();

  return useMutation<
    AlertChannel,
    Error,
    { id: string; enabled: boolean },
    AlertChannelsMutationContext
  >({
    mutationFn: ({ id, enabled }) => apiPatch<AlertChannel>(buildAlertChannelPath(id), { enabled }),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<AlertChannelsResponse>(listKey);
      updateAlertChannelsCache(queryClient, listKey, (channels) =>
        channels.map((channel) => (channel.id === id ? { ...channel, enabled } : channel))
      );
      return { previous, listKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export function useTestAlertChannelMutation() {
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiPost(buildAlertChannelTestPath(id)),
  });
}

export function useDeleteAlertChannelMutation() {
  const queryClient = useQueryClient();
  const listKey = alertChannelKeys.list();

  return useMutation<unknown, Error, string, AlertChannelsMutationContext>({
    mutationFn: (id) => apiDelete(buildAlertChannelPath(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<AlertChannelsResponse>(listKey);
      updateAlertChannelsCache(queryClient, listKey, (channels) =>
        channels.filter((channel) => channel.id !== id)
      );
      return { previous, listKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
