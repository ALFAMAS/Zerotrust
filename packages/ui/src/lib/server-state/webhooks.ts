"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  CreateWebhookEndpointInput,
  WebhookDeliveriesParams,
  WebhookDeliveriesResponse,
  WebhookEndpoint,
} from "./types";

const DEFAULT_DELIVERY_LIMIT = 50;

export const webhookKeys = queryKeys.webhooks;

export function buildWebhookDeliveriesPath(
  endpointId: string,
  params: WebhookDeliveriesParams = {}
): string {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? DEFAULT_DELIVERY_LIMIT));
  return `/webhooks/${endpointId}/deliveries?${search.toString()}`;
}

export function fetchWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  return apiGet<WebhookEndpoint[]>("/webhooks");
}

export function fetchWebhookDeliveries(
  endpointId: string,
  params: WebhookDeliveriesParams = {}
): Promise<WebhookDeliveriesResponse> {
  return apiGet<WebhookDeliveriesResponse>(buildWebhookDeliveriesPath(endpointId, params));
}

export function webhookEndpointsQueryOptions() {
  return queryOptions({
    queryKey: webhookKeys.list(),
    queryFn: fetchWebhookEndpoints,
  });
}

export function webhookDeliveriesQueryOptions(
  endpointId: string,
  params: WebhookDeliveriesParams = {}
) {
  const normalized = { limit: params.limit ?? DEFAULT_DELIVERY_LIMIT };
  return queryOptions({
    queryKey: webhookKeys.deliveries(endpointId, normalized),
    queryFn: () => fetchWebhookDeliveries(endpointId, normalized),
  });
}

export function useWebhookEndpointsQuery() {
  return useQuery(webhookEndpointsQueryOptions());
}

export function useWebhookDeliveriesQuery(
  endpointId: string | null,
  params: WebhookDeliveriesParams = {}
) {
  return useQuery({
    ...webhookDeliveriesQueryOptions(endpointId ?? "__none__", params),
    enabled: Boolean(endpointId),
  });
}

export function useCreateWebhookEndpointMutation() {
  const queryClient = useQueryClient();

  return useMutation<WebhookEndpoint, Error, CreateWebhookEndpointInput>({
    mutationFn: (input) => apiPost<WebhookEndpoint>("/webhooks", input),
    onSuccess: (created) => {
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (current) =>
        current ? [created, ...current] : current
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

interface ToggleWebhookInput {
  id: string;
  active: boolean;
}

interface ToggleWebhookContext {
  previousEndpoints?: WebhookEndpoint[];
}

export function useToggleWebhookEndpointMutation() {
  const queryClient = useQueryClient();

  return useMutation<WebhookEndpoint, Error, ToggleWebhookInput, ToggleWebhookContext>({
    mutationFn: ({ id, active }) => apiPatch<WebhookEndpoint>(`/webhooks/${id}`, { active }),
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: webhookKeys.list() });
      const previousEndpoints = queryClient.getQueryData<WebhookEndpoint[]>(webhookKeys.list());
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (current) =>
        current?.map((endpoint) => (endpoint.id === id ? { ...endpoint, active } : endpoint))
      );
      return { previousEndpoints };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEndpoints) {
        queryClient.setQueryData(webhookKeys.list(), context.previousEndpoints);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
    },
  });
}

interface DeleteWebhookContext {
  previousEndpoints?: WebhookEndpoint[];
}

export function useDeleteWebhookEndpointMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string, DeleteWebhookContext>({
    mutationFn: (id) => apiDelete(`/webhooks/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: webhookKeys.list() });
      const previousEndpoints = queryClient.getQueryData<WebhookEndpoint[]>(webhookKeys.list());
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (current) =>
        current?.filter((endpoint) => endpoint.id !== id)
      );
      return { previousEndpoints };
    },
    onError: (_error, _id, context) => {
      if (context?.previousEndpoints) {
        queryClient.setQueryData(webhookKeys.list(), context.previousEndpoints);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
      void queryClient.removeQueries({ queryKey: webhookKeys.detail(id) });
    },
  });
}

export function usePingWebhookEndpointMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (id) => apiPost(`/webhooks/${id}/ping`, {}),
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries(id) });
    },
  });
}
