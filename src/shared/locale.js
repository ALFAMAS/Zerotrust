"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOCALE = exports.SUPPORTED_LOCALES = void 0;
exports.isSupportedLocale = isSupportedLocale;
exports.normalizeLocale = normalizeLocale;
exports.localeFromAcceptLanguage = localeFromAcceptLanguage;
/**
 * Supported UI/email locales. Kept in sync with the Next.js UI
 * (`packages/ui/src/i18n/request.ts`).
 */
exports.SUPPORTED_LOCALES = ["en", "es", "fr"];
exports.DEFAULT_LOCALE = "en";
function isSupportedLocale(value) {
    return typeof value === "string" && exports.SUPPORTED_LOCALES.includes(value);
}
/** Coerce an arbitrary value to a supported locale, falling back to English. */
function normalizeLocale(value) {
    if (isSupportedLocale(value))
        return value;
    if (typeof value === "string") {
        const base = value.toLowerCase().split("-")[0];
        if (isSupportedLocale(base))
            return base;
    }
    return exports.DEFAULT_LOCALE;
}
/**
 * Pick the best supported locale from an `Accept-Language` header, honoring
 * quality weights (e.g. `fr-CA,fr;q=0.9,en;q=0.8`). Falls back to English.
 */
function localeFromAcceptLanguage(header) {
    if (!header)
        return exports.DEFAULT_LOCALE;
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
        if (isSupportedLocale(base))
            return base;
    }
    return exports.DEFAULT_LOCALE;
}
//# sourceMappingURL=locale.js.map