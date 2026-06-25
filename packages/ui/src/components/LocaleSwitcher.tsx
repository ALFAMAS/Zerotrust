"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
] as const;

function getCurrentLocale(): string {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/za_locale=([^;]+)/);
  return match?.[1] ?? "en";
}

export default function LocaleSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("en");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(getCurrentLocale());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function switchLocale(code: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: first-party locale preference cookie
    document.cookie = `za_locale=${code};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
    setCurrent(code);
    setOpen(false);
    // Persist to the account when signed in so transactional emails follow the
    // chosen language too. Best-effort — never block the UI switch on it.
    if (getToken()) {
      void api.patch("/auth/me", { locale: code }).catch(() => {});
    }
    window.location.reload();
  }

  const active = LOCALES.find((l) => l.code === current) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5 px-2.5 py-1.5 text-muted-foreground"
        variant="ghost"
        size="sm"
        aria-label="Switch language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{active.flag}</span>
        <span className="hidden sm:inline">{active.label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <div
          role="listbox"
          className="absolute end-0 z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl"
        >
          {LOCALES.map((locale) => (
            <Button
              key={locale.code}
              type="button"
              role="option"
              aria-selected={locale.code === current}
              onClick={() => switchLocale(locale.code)}
              className={cn(
                "h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2",
                locale.code === current ? "bg-accent text-foreground" : "text-muted-foreground"
              )}
              variant="ghost"
            >
              <span>{locale.flag}</span>
              {locale.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
