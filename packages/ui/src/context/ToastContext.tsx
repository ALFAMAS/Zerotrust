"use client";

import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

/**
 * Thin wrapper kept for backwards compatibility — the actual rendering is now
 * handled by sonner's <Toaster/>. Existing call sites (`useToast`, `ToastProvider`)
 * keep working unchanged.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

export function useToast(): { toast: (options: ToastOptions) => void } {
  return {
    toast: ({ message, type = "info", duration }: ToastOptions) => {
      const opts = duration ? { duration } : {};
      switch (type) {
        case "success":
          sonnerToast.success(message, opts);
          break;
        case "error":
          sonnerToast.error(message, opts);
          break;
        case "warning":
          sonnerToast.warning(message, opts);
          break;
        default:
          sonnerToast(message, opts);
          break;
      }
    },
  };
}
