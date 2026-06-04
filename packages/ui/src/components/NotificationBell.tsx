"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000";

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
    case "security": return "🔒";
    case "success":  return "✓";
    case "warning":  return "⚠️";
    case "error":    return "✕";
    default:         return "ℹ️";
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)  return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount]   = useState(0);
  const [open, setOpen]                 = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingList, setLoadingList]   = useState(false);
  const containerRef                    = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount
  useEffect(() => {
    api.get<{ count: number }>("/notifications/unread-count")
      .then((d) => setUnreadCount(d.count))
      .catch(() => {});
  }, []);

  // SSE for real-time badge updates
  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("token") ?? sessionStorage.getItem("token")
      : null;
    if (!token) return;

    // EventSource doesn't support custom headers; use a query param approach
    // or fall back to polling on unread count every 30 s
    const interval = setInterval(() => {
      api.get<{ count: number }>("/notifications/unread-count")
        .then((d) => setUnreadCount(d.count))
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
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
    api.get<Notification[]>("/notifications")
      .then((rows) => setNotifications(rows.slice(0, 5)))
      .catch(() => setNotifications([]))
      .finally(() => setLoadingList(false));
  }, [open]);

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await api.post("/notifications/read-all").catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.link) window.location.href = n.link;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loadingList ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={[
                    "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0",
                    n.read ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <span className="text-lg mt-0.5 flex-shrink-0">{typeIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{n.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                      {n.body.length > 80 ? n.body.slice(0, 80) + "…" : n.body}
                    </div>
                    <div className="text-[11px] text-gray-600 mt-1">{relativeTime(n.createdAt)}</div>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-800">
              <button
                onClick={markAllRead}
                className="w-full text-xs text-center text-indigo-400 hover:text-indigo-300 transition-colors py-1"
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
