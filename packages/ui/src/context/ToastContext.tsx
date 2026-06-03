"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
  duration: number;
  removing: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

const TYPE_STYLES: Record<ToastType, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-indigo-600",
  warning: "bg-amber-600",
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
};

let nextId = 0;

function ToastItem({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: number) => void;
}) {
  const bgClass = TYPE_STYLES[item.type];
  const icon = TYPE_ICONS[item.type];

  return (
    <div
      role="alert"
      className={[
        "flex items-start gap-3 w-80 rounded-lg px-4 py-3 text-white shadow-lg",
        bgClass,
        item.removing
          ? "animate-[slideOut_0.3s_ease-in_forwards]"
          : "animate-[slideIn_0.3s_ease-out_forwards]",
      ].join(" ")}
    >
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold leading-none mt-0.5">
        {icon}
      </span>
      <p className="flex-1 text-sm leading-snug break-words">{item.message}</p>
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 text-white/70 hover:text-white transition-colors ml-1 mt-0.5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const removeToast = useCallback((id: number) => {
    // Mark as removing for exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
    );
    // Clear any existing auto-dismiss timer for this toast
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
    // Remove from DOM after animation
    const removalTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
    // Store the removal timer so we can clean it up if needed
    timersRef.current.set(id, removalTimer);
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      const duration = options.duration ?? DEFAULT_DURATION;
      const type = options.type ?? "info";

      setToasts((prev) => {
        const next: ToastItem = {
          ...options,
          id,
          type,
          duration,
          removing: false,
        };
        // Cap at MAX_TOASTS — drop the oldest if at limit
        const trimmed =
          prev.length >= MAX_TOASTS ? prev.slice(prev.length - MAX_TOASTS + 1) : prev;
        return [...trimmed, next];
      });

      // Auto-dismiss
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastItem item={item} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
