import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  applyPpp,
  calculateTax,
  convertAmount,
  formatMoney,
  getExchangeRates,
  getLocalizedPricing,
  isEuCountry,
  isSupportedCurrency,
  isZeroDecimalCurrency,
  minorUnitsPer,
  pppForCountry,
  taxRateForLocation,
  validateVatFormat,
  validateVatNumber,
} from "../services/billing/globalization.service";

const ENV_KEYS = ["EXCHANGE_RATES_JSON", "EXCHANGE_RATES_API_URL", "VIES_CHECK_ENABLED"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Currencies ────────────────────────────────────────────────────────────────

describe("currency helpers", () => {
  it("recognises supported + zero-decimal currencies", () => {
    expect(isSupportedCurrency("usd")).toBe(true);
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isZeroDecimalCurrency("JPY")).toBe(true);
    expect(isZeroDecimalCurrency("USD")).toBe(false);
    expect(minorUnitsPer("USD")).toBe(100);
    expect(minorUnitsPer("JPY")).toBe(1);
  });
});

describe("convertAmount", () => {
  const rates = { USD: 1, EUR: 0.92, JPY: 150 };
  it("converts between two-decimal currencies", () => {
    expect(convertAmount(2000, "USD", "EUR", rates)).toBe(1840); // $20 → €18.40
  });
  it("handles a zero-decimal target", () => {
    expect(convertAmount(2000, "USD", "JPY", rates)).toBe(3000); // $20 → ¥3000
  });
  it("handles a zero-decimal source", () => {
    expect(convertAmount(3000, "JPY", "USD", rates)).toBe(2000); // ¥3000 → $20.00
  });
  it("throws on a missing rate", () => {
    expect(() => convertAmount(100, "USD", "XYZ", rates)).toThrow(/exchange rate/i);
  });
});

describe("formatMoney", () => {
  it("formats two-decimal and zero-decimal currencies", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(3140, "JPY")).toContain("3,140");
    expect(formatMoney(3140, "JPY")).not.toContain(".");
  });
});

describe("getExchangeRates", () => {
  it("honours the EXCHANGE_RATES_JSON override", async () => {
    process.env.EXCHANGE_RATES_JSON = JSON.stringify({ EUR: 0.5 });
    const rates = await getExchangeRates();
    expect(rates.USD).toBe(1);
    expect(rates.EUR).toBe(0.5);
  });
  it("falls back to the bundled table when nothing is configured", async () => {
    const rates = await getExchangeRates();
    expect(rates.USD).toBe(1);
    expect(typeof rates.EUR).toBe("number");
  });
});

// ── PPP ───────────────────────────────────────────────────────────────────────

describe("pppForCountry / applyPpp", () => {
  it("maps countries to discount tiers", () => {
    expect(pppForCountry("IN")).toMatchObject({ discountPercent: 50, tier: "tier3" });
    expect(pppForCountry("ng")).toMatchObject({ discountPercent: 60, tier: "tier4" });
    expect(pppForCountry("US")).toMatchObject({ discountPercent: 0, tier: "standard" });
    expect(pppForCountry(null)).toMatchObject({ discountPercent: 0 });
  });
  it("applies the discount to an amount", () => {
    expect(applyPpp(2000, "IN")).toBe(1000); // 50% off
    expect(applyPpp(2000, "US")).toBe(2000); // no discount
  });
});

// ── Tax ───────────────────────────────────────────────────────────────────────

describe("taxRateForLocation", () => {
  it("returns VAT/GST/none by country", () => {
    expect(taxRateForLocation({ country: "DE" })).toMatchObject({ rate: 19, kind: "vat" });
    expect(taxRateForLocation({ country: "GB" })).toMatchObject({ rate: 20, kind: "vat" });
    expect(taxRateForLocation({ country: "AU" })).toMatchObject({ rate: 10, kind: "gst" });
    expect(taxRateForLocation({ country: "ZZ" })).toMatchObject({ rate: 0, kind: "none" });
  });
});

describe("calculateTax", () => {
  it("adds tax for a taxable location", () => {
    const q = calculateTax(10000, { country: "DE" });
    expect(q).toMatchObject({ taxRate: 19, taxMinor: 1900, totalMinor: 11900, exempt: false });
  });
  it("zeroes tax when exempt", () => {
    const q = calculateTax(10000, { country: "DE" }, { exempt: true });
    expect(q).toMatchObject({ taxRate: 0, taxMinor: 0, totalMinor: 10000, exempt: true, taxKind: "none" });
  });
  it("zeroes tax on reverse charge", () => {
    const q = calculateTax(10000, { country: "FR" }, { reverseCharge: true });
    expect(q.taxMinor).toBe(0);
    expect(q.reverseCharge).toBe(true);
  });
});

// ── EU VAT ──────────────────────────────────────────────────────────────────

describe("isEuCountry / validateVatFormat", () => {
  it("identifies EU countries", () => {
    expect(isEuCountry("DE")).toBe(true);
    expect(isEuCountry("us")).toBe(false);
  });
  it("validates VAT number format per country", () => {
    expect(validateVatFormat("DE123456789").valid).toBe(true);
    expect(validateVatFormat("DE 123 456 789").valid).toBe(true); // whitespace stripped
    expect(validateVatFormat("DE12345").valid).toBe(false); // too short
    expect(validateVatFormat("EL123456789").valid).toBe(true); // Greece prefix
    expect(validateVatFormat("XX123456789").valid).toBe(false); // unknown prefix
    expect(validateVatFormat("FRAB123456789").valid).toBe(true);
  });
});

describe("validateVatNumber (VIES disabled)", () => {
  beforeEach(() => {
    process.env.VIES_CHECK_ENABLED = "false";
  });
  it("returns a format-only result for a well-formed number", async () => {
    const r = await validateVatNumber("DE123456789");
    expect(r).toMatchObject({ formatValid: true, viesChecked: false, valid: null, countryPrefix: "DE" });
  });
  it("rejects a malformed number without calling VIES", async () => {
    const r = await validateVatNumber("DE1");
    expect(r).toMatchObject({ formatValid: false, valid: false, viesChecked: false });
  });
});

// ── Localized pricing ──────────────────────────────────────────────────────────

describe("getLocalizedPricing", () => {
  beforeEach(() => {
    process.env.EXCHANGE_RATES_JSON = JSON.stringify({ EUR: 0.92 });
  });
  it("returns USD plan prices at full price for a standard country", async () => {
    const plans = await getLocalizedPricing("USD", "US");
    const pro = plans.find((p) => p.plan === "pro");
    expect(pro).toMatchObject({ amountMinor: 2000, formatted: "$20.00", pppDiscountPercent: 0 });
  });
  it("applies PPP for a discounted country", async () => {
    const plans = await getLocalizedPricing("USD", "IN");
    const pro = plans.find((p) => p.plan === "pro");
    expect(pro).toMatchObject({ amountMinor: 1000, formatted: "$10.00", pppDiscountPercent: 50 });
  });
  it("converts to the requested currency", async () => {
    const plans = await getLocalizedPricing("EUR", "US");
    const pro = plans.find((p) => p.plan === "pro");
    expect(pro?.amountMinor).toBe(1840); // $20 → €18.40
    expect(pro?.formatted).toBe("€18.40");
  });
});
