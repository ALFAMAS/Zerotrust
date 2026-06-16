"use client";

/**
 * Locale-aware formatting helpers built on the `Intl.*` APIs.
 *
 * These read the active next-intl locale so dates, numbers, currency and
 * relative times render in the user's language/region instead of being
 * hard-coded to `en-US`. Use the `useFormat()` hook in components; the bare
 * functions are available for non-React call sites that already know the locale.
 */
import { useLocale } from "next-intl";
import { useMemo } from "react";

export function formatDate(
  locale: string,
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(locale: string, value: Date | string | number): string {
  return formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(locale: string, value: number, currency = "USD"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
  { amount: Number.POSITIVE_INFINITY, unit: "years" },
];

/** "3 minutes ago" / "in 2 days", localized. */
export function formatRelativeTime(locale: string, value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "years");
}

/** Hook returning formatters bound to the current locale. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      date: (v: Date | string | number, o?: Intl.DateTimeFormatOptions) => formatDate(locale, v, o),
      dateTime: (v: Date | string | number) => formatDateTime(locale, v),
      number: (v: number, o?: Intl.NumberFormatOptions) => formatNumber(locale, v, o),
      currency: (v: number, currency?: string) => formatCurrency(locale, v, currency),
      relativeTime: (v: Date | string | number) => formatRelativeTime(locale, v),
    }),
    [locale]
  );
}
