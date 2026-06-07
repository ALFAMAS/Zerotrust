import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED_LOCALES = ["en", "es", "fr"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";

async function detectLocale(): Promise<Locale> {
  // 1. Cookie takes highest priority (explicit user preference)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("za_locale")?.value as Locale | undefined;
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Accept-Language header (browser preference)
  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  for (const part of acceptLanguage.split(",")) {
    const lang = part.split(";")[0].trim().toLowerCase().slice(0, 2) as Locale;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
      return lang;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await detectLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
