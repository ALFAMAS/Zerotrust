"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/lib/format";
import { navigateToSafeRelative } from "@/lib/safeRedirect";
import {
  bumpNotificationsUnreadCountCache,
  setNotificationsUnreadCountCache,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsListQuery,
  useNotificationsUnreadCountQuery,
} from "@/lib/server-state/notifications";
import type { Notification } from "@/lib/server-state/types";
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
  const esRef = useRef<EventSource | null>(null);

  const { data: unreadData } = useNotificationsUnreadCountQuery();
  const unreadCount = unreadData?.count ?? 0;
  const { data: notifications = [], isLoading: loadingList } = useNotificationsListQuery(open);
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  // SSE for real-time unread count updates (replaces 30s polling)
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? (localStorage.getItem("token") ?? sessionStorage.getItem("token"))
        : null;
    if (!token) return;

    const connect = () => {
      const es = new EventSource(
        `${process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:3000"}/notifications/sse?token=${token}`
      );
      esRef.current = es;

      es.addEventListener("notification", () => {
        bumpNotificationsUnreadCountCache(queryClient);
      });

      es.addEventListener("unread_count", ((e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setNotificationsUnreadCountCache(queryClient, data.count);
      }) as EventListener);

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
    };
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
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <Button variant="ghost" onClick={markAllRead} className="text-xs text-primary">
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loadingList ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <Button
                  variant="ghost"
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0",
                    n.read && "opacity-60"
                  )}
                >
                  <span className="mt-0.5 flex-shrink-0 text-lg">{typeIcon(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground/70">
                      {fmt.relativeTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  )}
                </Button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2">
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
