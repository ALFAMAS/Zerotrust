import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  directionForLocale,
  isSupportedLocale,
} from "../../packages/ui/src/i18n/locales";

// The UI ships LTR locales (en/es/fr) plus the RTL locale `ar`, which is what
// activates the `dir="rtl"` path on <html> in app/layout.tsx.

describe("UI locale set", () => {
  it("includes the Arabic RTL locale alongside the LTR ones", () => {
    expect(SUPPORTED_LOCALES).toContain("ar");
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("accepts supported locales and rejects others", () => {
    expect(isSupportedLocale("ar")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
  });
});

describe("directionForLocale", () => {
  it("flips RTL locales to rtl", () => {
    expect(directionForLocale("ar")).toBe("rtl");
    expect(directionForLocale("he")).toBe("rtl");
    expect(directionForLocale("fa")).toBe("rtl");
    expect(directionForLocale("ur")).toBe("rtl");
  });

  it("keeps LTR locales ltr", () => {
    expect(directionForLocale("en")).toBe("ltr");
    expect(directionForLocale("es")).toBe("ltr");
    expect(directionForLocale("fr")).toBe("ltr");
  });

  it("handles region subtags and casing", () => {
    expect(directionForLocale("ar-EG")).toBe("rtl");
    expect(directionForLocale("AR")).toBe("rtl");
    expect(directionForLocale("en-US")).toBe("ltr");
  });
});

describe("ar.json message catalog", () => {
  const messagesDir = path.join(process.cwd(), "packages", "ui", "messages");
  const en = JSON.parse(readFileSync(path.join(messagesDir, "en.json"), "utf8")) as Record<string, unknown>;
  const ar = JSON.parse(readFileSync(path.join(messagesDir, "ar.json"), "utf8")) as Record<string, unknown>;

  it("mirrors the English top-level namespaces", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("translates a sampling of strings (not left in English)", () => {
    const common = ar.common as Record<string, string>;
    expect(common.save).toBe("حفظ");
    expect(common.cancel).toBe("إلغاء");
    const auth = ar.auth as Record<string, string>;
    expect(auth.signIn).toBe("تسجيل الدخول");
  });

  it("preserves ICU interpolation placeholders", () => {
    const dashboard = ar.dashboard as Record<string, string>;
    expect(dashboard.welcome).toContain("{name}");
    const billing = ar.billing as Record<string, string>;
    expect(billing.renewsOn).toContain("{date}");
  });
});
