import { describe, it, expect } from "vitest";
import {
  normalizeLocale,
  localeFromAcceptLanguage,
  isSupportedLocale,
} from "../shared/locale";
import { tr } from "../templates/emails/i18n";
import { welcomeEmailTemplate } from "../templates/emails/welcome";
import { verifyEmailTemplate } from "../templates/emails/verify-email";

describe("locale negotiation", () => {
  it("accepts supported locales and rejects others", () => {
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
  });

  it("normalizes region tags and unknown values to a base/default locale", () => {
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("EN")).toBe("en");
    expect(normalizeLocale("de")).toBe("en"); // unsupported → default
    expect(normalizeLocale(undefined)).toBe("en");
  });

  it("picks the best supported locale from Accept-Language by quality weight", () => {
    expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,es;q=0.5")).toBe("es");
    expect(localeFromAcceptLanguage("de,zh")).toBe("en"); // none supported
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
  });
});

describe("email translation helper", () => {
  it("interpolates variables", () => {
    expect(tr("en", "welcome_heading", { name: "Alice" })).toBe("Welcome, Alice!");
  });

  it("falls back to English for an unknown key", () => {
    expect(tr("es", "nonexistent_key")).toBe("nonexistent_key");
  });
});

describe("localized templates", () => {
  it("renders the welcome email in Spanish and French", () => {
    const es = welcomeEmailTemplate({
      name: "Ana",
      appName: "ZeroAuth",
      appUrl: "https://app.test",
      loginUrl: "https://app.test/login",
      locale: "es",
    });
    expect(es.subject).toBe("¡Bienvenido a ZeroAuth!");
    expect(es.html).toContain("¡Bienvenido, Ana!");
    expect(es.html).toContain('lang="es"');

    const fr = welcomeEmailTemplate({
      name: "Jean",
      appName: "ZeroAuth",
      appUrl: "https://app.test",
      loginUrl: "https://app.test/login",
      locale: "fr",
    });
    expect(fr.subject).toBe("Bienvenue sur ZeroAuth !");
    expect(fr.html).toContain("Bienvenue, Jean");
  });

  it("defaults the verify email to English when no locale is given", () => {
    const en = verifyEmailTemplate({
      name: "Bob",
      code: "123456",
      verifyUrl: "https://app.test/verify",
      expiresInMinutes: 30,
      appName: "ZeroAuth",
    });
    expect(en.subject).toBe("Verify your email — ZeroAuth");
    expect(en.html).toContain("Confirm your email, Bob");
    expect(en.html).toContain("expire in 30 minutes");
  });

  it("localizes the verify email subject and expiry copy in Spanish", () => {
    const es = verifyEmailTemplate({
      name: "Ana",
      code: "654321",
      verifyUrl: "https://app.test/verify",
      expiresInMinutes: 15,
      appName: "ZeroAuth",
      locale: "es",
    });
    expect(es.subject).toBe("Verifica tu correo — ZeroAuth");
    expect(es.html).toContain("caducan en 15 minutos");
  });
});
