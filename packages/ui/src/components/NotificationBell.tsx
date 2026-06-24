"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error" | "security";
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Fetch unread count on mount
  useEffect(() => {
    api
      .get<{ count: number }>("/notifications/unread-count")
      .then((d) => setUnreadCount(d.count))
      .catch(() => {});
  }, []);

  // SSE for real-time unread count updates (replaces 30s polling)
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? (localStorage.getItem("token") ?? sessionStorage.getItem("token"))
        : null;
    if (!token) return;

    const connect = () => {
      const es = new EventSource(
        `${process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000"}/notifications/sse?token=${token}`
      );
      esRef.current = es;

      es.addEventListener("notification", () => {
        // New notification arrived — bump unread count
        setUnreadCount((c) => c + 1);
      });

      es.addEventListener("unread_count", ((e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setUnreadCount(data.count);
      }) as EventListener);

      es.onerror = () => {
        es.close();
        // Reconnect after 5s
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
    };
  }, []);

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

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    api
      .get<Notification[]>("/notifications")
      .then((rows) => setNotifications(rows.slice(0, 5)))
      .catch(() => setNotifications([]))
      .finally(() => setLoadingList(false));
  }, [open]);

  const markRead = useCallback(async (id: string) => {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.post("/notifications/read-all").catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.link) window.location.href = n.link;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

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
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary transition-colors hover:text-primary/80"
              >
                Mark all read
              </button>
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
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent",
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
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={markAllRead}
                className="w-full py-1 text-center text-xs text-primary transition-colors hover:text-primary/80"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
