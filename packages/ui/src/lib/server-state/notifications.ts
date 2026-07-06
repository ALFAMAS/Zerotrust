"use client";

import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  Notification,
  NotificationPreferences,
  NotificationsUnreadCount,
  PaginatedResponse,
  UpdateNotificationPreferencesInput,
} from "./types";

export const notificationKeys = queryKeys.notifications;

export const NOTIFICATIONS_PATH = "/notifications";
export const NOTIFICATIONS_UNREAD_COUNT_PATH = "/notifications/unread-count";
export const NOTIFICATIONS_READ_ALL_PATH = "/notifications/read-all";
export const NOTIFICATIONS_PREFERENCES_PATH = "/notifications/preferences";
export const NOTIFICATIONS_LIST_PREVIEW_LIMIT = 5;

export function buildNotificationReadPath(id: string): string {
  return `/notifications/${id}/read`;
}

export function fetchNotificationsUnreadCount(): Promise<NotificationsUnreadCount> {
  return apiGet<NotificationsUnreadCount>(NOTIFICATIONS_UNREAD_COUNT_PATH);
}

export function fetchNotificationsList(): Promise<Notification[]> {
  return apiGet<PaginatedResponse<Notification>>(
    `${NOTIFICATIONS_PATH}?limit=${NOTIFICATIONS_LIST_PREVIEW_LIMIT}`
  ).then((response) => response.data ?? []);
}

export function notificationsUnreadCountQueryOptions() {
  return queryOptions({
    queryKey: notificationKeys.unreadCount(),
    queryFn: fetchNotificationsUnreadCount,
  });
}

export function notificationsListQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: notificationKeys.list(),
    queryFn: fetchNotificationsList,
    enabled,
    select: (rows) => rows.slice(0, NOTIFICATIONS_LIST_PREVIEW_LIMIT),
  });
}

export function useNotificationsUnreadCountQuery() {
  return useQuery(notificationsUnreadCountQueryOptions());
}

export function useNotificationsListQuery(enabled: boolean) {
  return useQuery(notificationsListQueryOptions(enabled));
}

export function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return apiGet<NotificationPreferences>(NOTIFICATIONS_PREFERENCES_PATH);
}

export function notificationPreferencesQueryOptions() {
  return queryOptions({
    queryKey: notificationKeys.preferences(),
    queryFn: fetchNotificationPreferences,
  });
}

export function useNotificationPreferencesQuery() {
  return useQuery(notificationPreferencesQueryOptions());
}

interface PreferencesMutationContext {
  previous?: NotificationPreferences;
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();
  const preferencesKey = notificationKeys.preferences();

  return useMutation<
    NotificationPreferences,
    Error,
    UpdateNotificationPreferencesInput,
    PreferencesMutationContext
  >({
    mutationFn: (input) => apiPut<NotificationPreferences>(NOTIFICATIONS_PREFERENCES_PATH, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: preferencesKey });
      const previous = queryClient.getQueryData<NotificationPreferences>(preferencesKey);
      queryClient.setQueryData<NotificationPreferences>(preferencesKey, (current) => ({
        emailFallback: true,
        emailFallbackDays: 3,
        ...current,
        ...input,
        categories: input.categories ?? current?.categories,
      }));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: preferencesKey });
    },
  });
}

export function setNotificationsUnreadCountCache(queryClient: QueryClient, count: number) {
  queryClient.setQueryData<NotificationsUnreadCount>(notificationKeys.unreadCount(), { count });
}

export function bumpNotificationsUnreadCountCache(queryClient: QueryClient) {
  queryClient.setQueryData<NotificationsUnreadCount>(notificationKeys.unreadCount(), (current) => ({
    count: (current?.count ?? 0) + 1,
  }));
}

interface NotificationListMutationContext {
  previousUnread?: NotificationsUnreadCount;
  previousList?: Notification[];
}

function updateNotificationListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (notifications: Notification[]) => Notification[]
) {
  queryClient.setQueryData<Notification[]>(notificationKeys.list(), (current) =>
    current ? updater(current) : current
  );
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  const unreadKey = notificationKeys.unreadCount();
  const listKey = notificationKeys.list();

  return useMutation<unknown, Error, string, NotificationListMutationContext>({
    mutationFn: (id) => apiPost(buildNotificationReadPath(id), {}),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: unreadKey });
      const previousUnread = queryClient.getQueryData<NotificationsUnreadCount>(unreadKey);
      const previousList = queryClient.getQueryData<Notification[]>(listKey);

      updateNotificationListCache(queryClient, (notifications) =>
        notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification
        )
      );
      queryClient.setQueryData<NotificationsUnreadCount>(unreadKey, (current) => ({
        count: Math.max(0, (current?.count ?? 0) - 1),
      }));

      return { previousUnread, previousList };
    },
    onError: (_error, _id, context) => {
      if (context?.previousUnread) {
        queryClient.setQueryData(unreadKey, context.previousUnread);
      }
      if (context?.previousList) {
        queryClient.setQueryData(listKey, context.previousList);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  const unreadKey = notificationKeys.unreadCount();
  const listKey = notificationKeys.list();

  return useMutation<unknown, Error, void, NotificationListMutationContext>({
    mutationFn: () => apiPost(NOTIFICATIONS_READ_ALL_PATH, {}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      await queryClient.cancelQueries({ queryKey: unreadKey });
      const previousUnread = queryClient.getQueryData<NotificationsUnreadCount>(unreadKey);
      const previousList = queryClient.getQueryData<Notification[]>(listKey);

      updateNotificationListCache(queryClient, (notifications) =>
        notifications.map((notification) => ({ ...notification, read: true }))
      );
      queryClient.setQueryData<NotificationsUnreadCount>(unreadKey, {
        count: 0,
      });

      return { previousUnread, previousList };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousUnread) {
        queryClient.setQueryData(unreadKey, context.previousUnread);
      }
      if (context?.previousList) {
        queryClient.setQueryData(listKey, context.previousList);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
