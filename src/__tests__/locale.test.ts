import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeFromAcceptLanguage,
  normalizeLocale,
} from "../shared/locale";

describe("shared/locale", () => {
  it("recognises supported locales", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it("normalises region tags to base locale", () => {
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("ES-mx")).toBe("es");
  });

  it("falls back to English for unsupported values", () => {
    expect(normalizeLocale("de")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it("picks the highest-weight supported language from Accept-Language", () => {
    expect(localeFromAcceptLanguage("de-DE,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,fr;q=0.8")).toBe("en");
  });

  it("returns English when the header is missing or has no supported tags", () => {
    expect(localeFromAcceptLanguage()).toBe("en");
    expect(localeFromAcceptLanguage("de-DE,ja-JP;q=0.9")).toBe("en");
  });
});
