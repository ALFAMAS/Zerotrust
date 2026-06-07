"use client";

import { useEffect, useRef, useState } from "react";

const LOCALES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
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
    document.cookie = `za_locale=${code};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
    setCurrent(code);
    setOpen(false);
    window.location.reload();
  }

  const active = LOCALES.find((l) => l.code === current) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        aria-label="Switch language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{active.flag}</span>
        <span className="hidden sm:inline">{active.label}</span>
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 w-36 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden"
        >
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              role="option"
              aria-selected={locale.code === current}
              onClick={() => switchLocale(locale.code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                locale.code === current
                  ? "text-white bg-gray-800"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{locale.flag}</span>
              {locale.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
