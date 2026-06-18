export const SUPPORTED_LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const RTL_LOCALES = new Set<string>(["ar", "fa", "he", "ur"]);

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function directionForLocale(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale.toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}
