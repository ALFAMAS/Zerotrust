"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  CreateSupportTicketInput,
  SupportMessage,
  SupportThreadResponse,
  SupportTicket,
  SupportTicketsResponse,
} from "./types";

export const supportKeys = queryKeys.support;

export function fetchSupportTickets(): Promise<SupportTicketsResponse> {
  return apiGet<SupportTicketsResponse>("/support");
}

export function fetchSupportThread(id: string): Promise<SupportThreadResponse> {
  return apiGet<SupportThreadResponse>(`/support/${id}`);
}

export function supportTicketsQueryOptions() {
  return queryOptions({
    queryKey: supportKeys.list(),
    queryFn: fetchSupportTickets,
  });
}

export function supportThreadQueryOptions(id: string) {
  return queryOptions({
    queryKey: supportKeys.detail(id),
    queryFn: () => fetchSupportThread(id),
  });
}

export function useSupportTicketsQuery() {
  return useQuery(supportTicketsQueryOptions());
}

export function useSupportThreadQuery(id: string | null) {
  return useQuery({
    ...supportThreadQueryOptions(id ?? "__none__"),
    enabled: Boolean(id),
  });
}

export function useCreateSupportTicketMutation() {
  const queryClient = useQueryClient();

  return useMutation<SupportThreadResponse, Error, CreateSupportTicketInput>({
    mutationFn: (input) => apiPost<SupportThreadResponse>("/support", input),
    onSuccess: (created) => {
      queryClient.setQueryData<SupportTicketsResponse>(supportKeys.list(), (current) => {
        if (!current) return current;
        return { ...current, tickets: [created.ticket, ...current.tickets] };
      });
      queryClient.setQueryData(supportKeys.detail(created.ticket.id), created);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}

interface ReplySupportTicketInput {
  id: string;
  body: string;
}

export function useReplySupportTicketMutation() {
  const queryClient = useQueryClient();

  return useMutation<SupportMessage, Error, ReplySupportTicketInput>({
    mutationFn: ({ id, body }) => apiPost<SupportMessage>(`/support/${id}/messages`, { body }),
    onSuccess: (message, { id }) => {
      queryClient.setQueryData<SupportThreadResponse>(supportKeys.detail(id), (current) => {
        if (!current) return current;
        return { ...current, messages: [...current.messages, message] };
      });
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: supportKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}

interface UpdateTicketStatusInput {
  id: string;
  status: SupportTicket["status"];
}

export function useUpdateTicketStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ ticket: SupportTicket }, Error, UpdateTicketStatusInput>({
    mutationFn: ({ id, status }) => apiPatch(`/support/${id}`, { status }),
    onSuccess: ({ ticket }, { id }) => {
      queryClient.setQueryData<SupportTicketsResponse>(supportKeys.list(), (current) => {
        if (!current) return current;
        return {
          ...current,
          tickets: current.tickets.map((t) => (t.id === id ? ticket : t)),
        };
      });
      queryClient.setQueryData<SupportThreadResponse>(supportKeys.detail(id), (current) => {
        if (!current) return current;
        return { ...current, ticket };
      });
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: supportKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}
