import { resolveMx } from "dns/promises";

export interface EmailValidationResult {
  allowed: boolean;
  code?: "DISPOSABLE_EMAIL" | "EMAIL_DOMAIN_HAS_NO_MX" | "INVALID_EMAIL";
  message?: string;
}

const DEFAULT_DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
]);

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isDisposableEmailDomain(domain: string): boolean {
  const normalized = domain.toLowerCase();
  const allowList = new Set(envList("DISPOSABLE_EMAIL_ALLOWLIST"));
  if (allowList.has(normalized)) return false;

  const blockList = new Set([
    ...DEFAULT_DISPOSABLE_DOMAINS,
    ...envList("DISPOSABLE_EMAIL_BLOCKLIST"),
  ]);
  return blockList.has(normalized);
}

export async function validateSignupEmail(email: string): Promise<EmailValidationResult> {
  const domain = normalizeEmailDomain(email);
  if (!domain) {
    return { allowed: false, code: "INVALID_EMAIL", message: "Invalid email address" };
  }

  if (isDisposableEmailDomain(domain)) {
    return {
      allowed: false,
      code: "DISPOSABLE_EMAIL",
      message: "Disposable email addresses are not allowed",
    };
  }

  if (process.env.DISPOSABLE_EMAIL_VALIDATE_MX === "true") {
    try {
      const records = await resolveMx(domain);
      if (records.length === 0) {
        return {
          allowed: false,
          code: "EMAIL_DOMAIN_HAS_NO_MX",
          message: "Email domain cannot receive mail",
        };
      }
    } catch {
      return {
        allowed: false,
        code: "EMAIL_DOMAIN_HAS_NO_MX",
        message: "Email domain cannot receive mail",
      };
    }
  }

  return { allowed: true };
}
