/**
 * Centralized structured-log redaction (CWE-532 / security baseline §3).
 * Applied before stdout, Elasticsearch, and SIEM fan-out.
 */

export const REDACT_CENSOR = "[REDACTED]";

const SENSITIVE_KEY_RE =
  /(?:^|_)(?:password|passwd|pwd|secret|token|authorization|cookie|otp|pin|tfn|api[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token)(?:$|_)/i;

const SENSITIVE_STRING_RE =
  /\b(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api[_-]?key|authorization|otp)\s*[:=]\s*["']?[^"'\s,;&}]+/gi;

const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

const DB_URL_RE = /\b(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@[^/\s]+(?:\/[^\s]*)?)/gi;

const QUERY_SECRET_RE =
  /([?&](?:password|secret|client_secret|token|access_token|refresh_token|api_key|otp)=)[^&\s]+/gi;

export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/** Redact sensitive substrings inside free-form log text (errors, stacks). */
export function redactLogString(value: string): string {
  return value
    .replace(SENSITIVE_STRING_RE, "$1=[REDACTED]")
    .replace(BEARER_RE, `Bearer ${REDACT_CENSOR}`)
    .replace(DB_URL_RE, `$1${REDACT_CENSOR}$3`)
    .replace(QUERY_SECRET_RE, "$1[REDACTED]");
}

/** Deep-clone and redact a structured log/audit payload. */
export function redactLogEntry<T extends Record<string, unknown>>(entry: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entry)) {
    if (isSensitiveLogKey(key)) {
      result[key] = REDACT_CENSOR;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    if (typeof value === "string") {
      result[key] = redactLogString(value);
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? redactLogEntry(item as Record<string, unknown>)
          : typeof item === "string"
            ? redactLogString(item)
            : item
      );
      continue;
    }

    if (typeof value === "object") {
      result[key] = redactLogEntry(value as Record<string, unknown>);
      continue;
    }

    result[key] = value;
  }

  return result as T;
}
