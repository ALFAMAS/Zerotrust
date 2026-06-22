/**
 * Globalization for billing — multi-currency pricing, Purchasing Power Parity
 * (PPP) discounts, location-based tax (Stripe Tax style), and EU VAT validation.
 *
 * Everything here is offline-safe: FX rates fall back to a bundled table, and the
 * VIES (EU VAT) lookup degrades to a format-only check when the network or the
 * VIES service is unavailable (mirrors how the HIBP breach check fails open).
 *
 *   EXCHANGE_RATES_JSON      optional JSON object of USD-based rates, e.g.
 *                            {"EUR":0.92,"GBP":0.79} — overrides the fallback table
 *   EXCHANGE_RATES_API_URL   optional endpoint returning {"rates":{...}} (USD base)
 *   VIES_CHECK_ENABLED       set "false" to skip the live VIES call (format-only)
 */

import { getLogger } from "../logger";

const logger = getLogger("globalization");

// ── Currencies ────────────────────────────────────────────────────────────────

export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
  /** Stripe "zero-decimal" currencies have no minor unit (¥100 = 100, not 10000). */
  zeroDecimal: boolean;
}

/** Stripe zero-decimal currencies (no cents). */
const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "USD", symbol: "$", name: "US Dollar", zeroDecimal: false },
  { code: "EUR", symbol: "€", name: "Euro", zeroDecimal: false },
  { code: "GBP", symbol: "£", name: "British Pound", zeroDecimal: false },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", zeroDecimal: true },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar", zeroDecimal: false },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", zeroDecimal: false },
  { code: "INR", symbol: "₹", name: "Indian Rupee", zeroDecimal: false },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", zeroDecimal: false },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", zeroDecimal: false },
  { code: "ZAR", symbol: "R", name: "South African Rand", zeroDecimal: false },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", zeroDecimal: false },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", zeroDecimal: false },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", zeroDecimal: false },
  { code: "PLN", symbol: "zł", name: "Polish Złoty", zeroDecimal: false },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", zeroDecimal: false },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", zeroDecimal: false },
];

const CURRENCY_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.has(code.toUpperCase());
}

export function isZeroDecimalCurrency(code: string): boolean {
  return ZERO_DECIMAL.has(code.toUpperCase());
}

/** Minor units per major unit for a currency (1 for zero-decimal, else 100). */
export function minorUnitsPer(code: string): number {
  return isZeroDecimalCurrency(code) ? 1 : 100;
}

// ── Exchange rates (USD base) ─────────────────────────────────────────────────

/** Bundled fallback rates (USD → currency). Approximate; refreshed via env/API. */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CAD: 1.37,
  AUD: 1.51,
  INR: 83.4,
  BRL: 5.43,
  MXN: 18.6,
  ZAR: 18.2,
  SGD: 1.35,
  CHF: 0.89,
  SEK: 10.5,
  PLN: 3.97,
  TRY: 32.3,
  NGN: 1480,
};

let _ratesCache: { rates: Record<string, number>; at: number } | null = null;
const RATES_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function parseEnvRates(): Record<string, number> | null {
  const raw = process.env.EXCHANGE_RATES_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { USD: 1, ...parsed };
  } catch {
    logger.warn("EXCHANGE_RATES_JSON is not valid JSON; ignoring");
    return null;
  }
}

/**
 * USD-based exchange rates. Resolution order: env JSON override → cached API
 * fetch (`EXCHANGE_RATES_API_URL`) → bundled fallback. Always resolves.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const envRates = parseEnvRates();
  if (envRates) return envRates;

  if (_ratesCache && Date.now() - _ratesCache.at < RATES_TTL_MS) {
    return _ratesCache.rates;
  }

  const url = process.env.EXCHANGE_RATES_API_URL;
  if (url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const body = (await res.json()) as { rates?: Record<string, number> };
        if (body.rates && typeof body.rates === "object") {
          const rates = { USD: 1, ...body.rates };
          _ratesCache = { rates, at: Date.now() };
          return rates;
        }
      }
    } catch (err) {
      logger.warn("Exchange-rate fetch failed; using fallback table", { error: String(err) });
    }
  }

  return FALLBACK_RATES;
}

/**
 * Convert an amount in `from`'s minor units to `to`'s minor units, handling
 * zero-decimal currencies on both sides. Rounds to the nearest minor unit.
 */
export function convertAmount(
  amountMinor: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) {
    throw new Error(`Missing exchange rate for ${!fromRate ? fromCode : toCode}`);
  }
  // Major amount in source currency → USD → target currency.
  const majorFrom = amountMinor / minorUnitsPer(fromCode);
  const majorUsd = majorFrom / fromRate;
  const majorTo = majorUsd * toRate;
  return Math.round(majorTo * minorUnitsPer(toCode));
}

/** Locale-aware currency formatting. `amountMinor` is in `currency`'s minor units. */
export function formatMoney(amountMinor: number, currency: string, locale = "en-US"): string {
  const code = currency.toUpperCase();
  const major = amountMinor / minorUnitsPer(code);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(major);
  } catch {
    // Unknown currency → plain number with the code suffix.
    return `${major.toFixed(isZeroDecimalCurrency(code) ? 0 : 2)} ${code}`;
  }
}

// ── Purchasing Power Parity (PPP) ─────────────────────────────────────────────

/** Country → PPP discount percentage. Default (unlisted) is 0% (full price). */
const PPP_DISCOUNTS: Record<string, number> = {
  // Tier 1 — emerging-but-mid (20%)
  PL: 20,
  PT: 20,
  GR: 20,
  HU: 20,
  RO: 20,
  HR: 20,
  CL: 20,
  MY: 20,
  CN: 20,
  // Tier 2 — mid (35%)
  BR: 35,
  MX: 35,
  TR: 35,
  ZA: 35,
  TH: 35,
  RU: 35,
  AR: 35,
  CO: 35,
  KZ: 35,
  // Tier 3 — lower (50%)
  IN: 50,
  ID: 50,
  PH: 50,
  VN: 50,
  EG: 50,
  UA: 50,
  KE: 50,
  MA: 50,
  LK: 50,
  // Tier 4 — lowest (60%)
  NG: 60,
  PK: 60,
  BD: 60,
  NP: 60,
  ET: 60,
  GH: 60,
  TZ: 60,
  UG: 60,
};

export interface PppResult {
  country: string;
  discountPercent: number;
  /** Human label of the discount tier. */
  tier: "standard" | "tier1" | "tier2" | "tier3" | "tier4";
}

export function pppForCountry(country: string | null | undefined): PppResult {
  const cc = (country ?? "").toUpperCase();
  const discountPercent = PPP_DISCOUNTS[cc] ?? 0;
  const tier =
    discountPercent >= 60
      ? "tier4"
      : discountPercent >= 50
        ? "tier3"
        : discountPercent >= 35
          ? "tier2"
          : discountPercent >= 20
            ? "tier1"
            : "standard";
  return { country: cc, discountPercent, tier };
}

/** Apply a country's PPP discount to a minor-unit amount (rounded). */
export function applyPpp(amountMinor: number, country: string | null | undefined): number {
  const { discountPercent } = pppForCountry(country);
  if (discountPercent <= 0) return amountMinor;
  return Math.round(amountMinor * (1 - discountPercent / 100));
}

// ── Tax (Stripe Tax style: VAT / GST / sales tax by location) ─────────────────

/** EU member states (ISO-3166 alpha-2). `EL` is the VAT prefix Greece uses. */
export const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

/** Standard VAT/GST/sales-tax rate (%) by country. */
const STANDARD_TAX_RATES: Record<string, number> = {
  // EU standard VAT
  AT: 20,
  BE: 21,
  BG: 20,
  HR: 25,
  CY: 19,
  CZ: 21,
  DK: 25,
  EE: 22,
  FI: 25.5,
  FR: 20,
  DE: 19,
  GR: 24,
  HU: 27,
  IE: 23,
  IT: 22,
  LV: 21,
  LT: 21,
  LU: 17,
  MT: 18,
  NL: 21,
  PL: 23,
  PT: 23,
  RO: 19,
  SK: 23,
  SI: 22,
  ES: 21,
  SE: 25,
  // Non-EU VAT / GST
  GB: 20,
  CH: 8.1,
  NO: 25,
  AU: 10,
  NZ: 15,
  CA: 5,
  SG: 9,
  ZA: 15,
  IN: 18,
  JP: 10,
};

export type TaxKind = "vat" | "gst" | "sales_tax" | "none";

function taxKindFor(country: string): TaxKind {
  if (EU_COUNTRIES.has(country) || ["GB", "CH", "NO"].includes(country)) return "vat";
  if (["AU", "NZ", "CA", "SG", "IN"].includes(country)) return "gst";
  if (country in STANDARD_TAX_RATES) return "sales_tax";
  return "none";
}

export interface TaxRate {
  country: string;
  region?: string;
  rate: number; // percent
  kind: TaxKind;
}

export function taxRateForLocation(location: {
  country?: string | null;
  region?: string | null;
}): TaxRate {
  const country = (location.country ?? "").toUpperCase();
  const rate = STANDARD_TAX_RATES[country] ?? 0;
  return {
    country,
    region: location.region ?? undefined,
    rate,
    kind: rate > 0 ? taxKindFor(country) : "none",
  };
}

export interface TaxQuote {
  country: string;
  taxRate: number;
  taxKind: TaxKind;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  exempt: boolean;
  /** B2B EU cross-border supply with a valid VAT number — VAT reverse-charged. */
  reverseCharge: boolean;
}

/**
 * Calculate tax on a net amount (minor units). `exempt` zeroes the tax (e.g. a
 * verified non-profit); `reverseCharge` applies the EU B2B 0%-with-note rule.
 */
export function calculateTax(
  netMinor: number,
  location: { country?: string | null; region?: string | null },
  opts: { exempt?: boolean; reverseCharge?: boolean } = {}
): TaxQuote {
  const { country, rate, kind } = taxRateForLocation(location);
  const zeroed = Boolean(opts.exempt || opts.reverseCharge);
  const effectiveRate = zeroed ? 0 : rate;
  const taxMinor = Math.round(netMinor * (effectiveRate / 100));
  return {
    country,
    taxRate: effectiveRate,
    taxKind: zeroed ? "none" : kind,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    exempt: Boolean(opts.exempt),
    reverseCharge: Boolean(opts.reverseCharge),
  };
}

// ── EU VAT number validation (format + VIES) ──────────────────────────────────

export function isEuCountry(country: string): boolean {
  return EU_COUNTRIES.has(country.toUpperCase());
}

// Per-member-state VAT number body patterns (after the 2-letter country prefix).
// Greece uses the `EL` prefix rather than `GR`.
const VAT_PATTERNS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^0?\d{9}$/,
  BG: /^\d{9,10}$/,
  HR: /^\d{11}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  DE: /^\d{9}$/,
  EL: /^\d{9}$/,
  HU: /^\d{8}$/,
  IE: /^\d{7}[A-Z]{1,2}$|^\d[A-Z]\d{5}[A-Z]$/,
  IT: /^\d{11}$/,
  LV: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SK: /^\d{10}$/,
  SI: /^\d{8}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  SE: /^\d{12}$/,
};

export interface VatFormatResult {
  valid: boolean;
  /** VIES/VAT country prefix (e.g. `EL` for Greece), uppercased. */
  countryPrefix: string;
  number: string;
  reason?: string;
}

/**
 * Validate the *format* of an EU VAT number (e.g. "DE123456789"). Strips spaces
 * and a leading country prefix, then checks the per-country body pattern.
 */
export function validateVatFormat(vatNumber: string): VatFormatResult {
  const cleaned = vatNumber.replace(/[\s.-]/g, "").toUpperCase();
  const prefix = cleaned.slice(0, 2);
  const body = cleaned.slice(2);

  const isEuVatPrefix = EU_COUNTRIES.has(prefix) || prefix === "EL";
  if (!isEuVatPrefix) {
    return {
      valid: false,
      countryPrefix: prefix,
      number: body,
      reason: "Unknown EU VAT country prefix",
    };
  }
  const pattern = VAT_PATTERNS[prefix];
  if (!pattern) {
    return { valid: false, countryPrefix: prefix, number: body, reason: "No pattern for country" };
  }
  return { valid: pattern.test(body), countryPrefix: prefix, number: body };
}

export interface VatCheckResult {
  vatNumber: string;
  countryPrefix: string;
  formatValid: boolean;
  /** Whether the live VIES lookup ran. False when skipped or unreachable. */
  viesChecked: boolean;
  /** VIES verdict; null when not checked (format-only). */
  valid: boolean | null;
  name?: string;
  address?: string;
}

/**
 * Validate an EU VAT number: format first, then (best-effort) a live VIES lookup.
 * Network/VIES failures degrade to a format-only result (`viesChecked: false`).
 */
export async function validateVatNumber(vatNumber: string): Promise<VatCheckResult> {
  const fmt = validateVatFormat(vatNumber);
  const base: VatCheckResult = {
    vatNumber: vatNumber.replace(/[\s.-]/g, "").toUpperCase(),
    countryPrefix: fmt.countryPrefix,
    formatValid: fmt.valid,
    viesChecked: false,
    valid: null,
  };

  if (!fmt.valid) return { ...base, valid: false };
  if (process.env.VIES_CHECK_ENABLED === "false") return base;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: fmt.countryPrefix, vatNumber: fmt.number }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return base;
    const data = (await res.json()) as { valid?: boolean; name?: string; address?: string };
    return {
      ...base,
      viesChecked: true,
      valid: Boolean(data.valid),
      name: data.name,
      address: data.address,
    };
  } catch (err) {
    logger.warn("VIES VAT lookup failed; returning format-only result", { error: String(err) });
    return base;
  }
}

// ── Localized plan pricing (multi-currency + PPP) ─────────────────────────────

/** Base monthly plan prices in USD minor units (display defaults). */
const BASE_PLAN_PRICES_USD: Record<string, number> = {
  free: 0,
  pro: 2000, // $20.00
  enterprise: 9900, // $99.00
};

export interface LocalizedPlanPrice {
  plan: string;
  currency: string;
  baseMinor: number;
  amountMinor: number;
  formatted: string;
  pppDiscountPercent: number;
}

/**
 * Localized, PPP-adjusted plan prices for display. Charging still happens through
 * Stripe price IDs — this powers the "from {local price}" marketing display.
 */
export async function getLocalizedPricing(
  currency: string,
  country: string | null | undefined,
  locale = "en-US"
): Promise<LocalizedPlanPrice[]> {
  const code = currency.toUpperCase();
  const rates = await getExchangeRates();
  const ppp = pppForCountry(country);

  return Object.entries(BASE_PLAN_PRICES_USD).map(([plan, usdMinor]) => {
    const converted = code === "USD" ? usdMinor : convertAmount(usdMinor, "USD", code, rates);
    const amountMinor = applyPpp(converted, country);
    return {
      plan,
      currency: code,
      baseMinor: converted,
      amountMinor,
      formatted: formatMoney(amountMinor, code, locale),
      pppDiscountPercent: ppp.discountPercent,
    };
  });
}
