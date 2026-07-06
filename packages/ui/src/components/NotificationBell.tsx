"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getToken } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import { navigateToSafeRelative } from "@/lib/safeRedirect";
import {
  bumpNotificationsUnreadCountCache,
  notificationKeys,
  setNotificationsUnreadCountCache,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsListQuery,
  useNotificationsUnreadCountQuery,
} from "@/lib/server-state/notifications";
import type { Notification } from "@/lib/server-state/types";
import { connectAuthenticatedSse } from "@/lib/sseClient";
import { cn } from "@/lib/utils";

function typeIcon(type: Notification["type"]): string {
  switch (type) {
    case "security":
      return "🔒";
    case "success":
      return "✓";
    case "warning":
      return "⚠️";
    case "error":
      return "✕";
    default:
      return "ℹ️";
  }
}

export function NotificationBell() {
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: unreadData } = useNotificationsUnreadCountQuery();
  const unreadCount = unreadData?.count ?? 0;
  const { data: notifications = [], isLoading: loadingList } = useNotificationsListQuery(open);
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  // SSE for real-time unread count updates (Bearer auth via fetch — no ?token=)
  useEffect(() => {
    const disconnect = connectAuthenticatedSse({
      url: `${brand.apiUrl}/notifications/sse`,
      getToken,
      onEvent: (event, data) => {
        if (event === "notification") {
          bumpNotificationsUnreadCountCache(queryClient);
          void queryClient.invalidateQueries({
            queryKey: notificationKeys.list(),
          });
          return;
        }
        if (event === "unread_count") {
          try {
            const parsed = JSON.parse(data) as { count?: number };
            if (typeof parsed.count === "number") {
              setNotificationsUnreadCountCache(queryClient, parsed.count);
            }
          } catch {
            // ignore malformed payloads
          }
        }
      },
    });

    return disconnect;
  }, [queryClient]);

  // Close dropdown on click-outside or Escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function markRead(id: string) {
    markReadMutation.mutate(id);
  }

  function markAllRead() {
    markAllReadMutation.mutate();
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.link) navigateToSafeRelative(n.link, "/dashboard");
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          className="absolute right-0 z-50 mt-2 w-[28rem] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <Button variant="ghost" onClick={markAllRead} className="text-xs text-primary">
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-[min(32rem,calc(100vh-8rem))] overflow-y-auto">
            {loadingList ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              <ul role="list" className="divide-y divide-border">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Button
                      variant="ghost"
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "flex h-auto min-h-[5.5rem] w-full items-start gap-4 whitespace-normal rounded-none px-5 py-4 text-left",
                        n.read && "opacity-60"
                      )}
                    >
                      <span className="mt-0.5 shrink-0 text-xl leading-none">
                        {typeIcon(n.type)}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                          {n.title}
                        </div>
                        <div className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                          {n.body}
                        </div>
                        <div className="text-xs text-muted-foreground/70">
                          {fmt.relativeTime(n.createdAt)}
                        </div>
                      </div>
                      {!n.read && (
                        <span
                          className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-5 py-2.5">
              <Button
                variant="ghost"
                onClick={markAllRead}
                className="w-full py-1 text-center text-xs text-primary"
              >
                Mark all as read
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
