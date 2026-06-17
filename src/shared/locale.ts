/**
 * Supported UI/email locales. Kept in sync with the Next.js UI
 * (`packages/ui/src/i18n/request.ts`).
 */
export const SUPPORTED_LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Coerce an arbitrary value to a supported locale, falling back to English. */
export function normalizeLocale(value: unknown): Locale {
  if (isSupportedLocale(value)) return value;
  if (typeof value === "string") {
    const base = value.toLowerCase().split("-")[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Pick the best supported locale from an `Accept-Language` header, honoring
 * quality weights (e.g. `fr-CA,fr;q=0.9,en;q=0.8`). Falls back to English.
 */
export function localeFromAcceptLanguage(header?: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const weight = q ? parseFloat(q.split("=")[1]) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 1 };
    })
    .sort((a, b) => b.weight - a.weight);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
