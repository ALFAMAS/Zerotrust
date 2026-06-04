export const CONSENT_KEY = "za_cookie_consent";

export type ConsentValue = "accepted" | "declined";

export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as ConsentValue | null;
}

export function setConsent(value: ConsentValue): void {
  localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent("za:consent-change", { detail: { value } }));
}
