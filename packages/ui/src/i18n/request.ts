import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./locales";

async function detectLocale(): Promise<Locale> {
  // 1. Cookie takes highest priority (explicit user preference)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("za_locale")?.value as Locale | undefined;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Accept-Language header (browser preference)
  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  for (const part of acceptLanguage.split(",")) {
    const lang = part.split(";")[0].trim().toLowerCase().slice(0, 2) as Locale;
    if (isSupportedLocale(lang)) {
      return lang;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await detectLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;

  // Missing-translation fallback: merge English underneath the active locale
  // so untranslated keys render in English instead of showing the raw key.
  if (locale !== DEFAULT_LOCALE) {
    const english = (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
    return {
      locale,
      messages: deepMerge(english, messages),
      onError(error) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[i18n] ${error.code}: ${error.originalMessage ?? error.message}`);
        }
      },
      getMessageFallback({ namespace, key }) {
        // Last resort — never show ugly dotted key paths to users
        return [namespace, key].filter(Boolean).join(".").split(".").pop() ?? key;
      },
    };
  }

  return { locale, messages };
});

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
