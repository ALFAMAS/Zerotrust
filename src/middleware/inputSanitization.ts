/**
 * Global input sanitization middleware — XSS / CWE-78 mitigation.
 *
 * Sanitizes all string values in JSON request bodies, query params, path
 * params, and form fields. Dangerous tags (<script>, <style>, <svg>, etc.)
 * are stripped entirely along with their content. Benign-looking tags
 * (<img>, <a>, <div>) have their event-handler attributes removed and are
 * then HTML-entity-encoded so they render as text, not markup.
 *
 * Sensitive fields (passwords, tokens, secrets) are never mutated.
 * Signed SSF-JSON bodies bypass sanitization (signature needs raw bytes).
 */

import type { Context, Next } from "hono";

/** Field names that must never be mutated (byte-for-byte fidelity required). */
const SENSITIVE_FIELDS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "client_secret",
  "token",
  "access_token",
  "refresh_token",
  "refreshToken",
  "apiKey",
  "api_key",
  "authorization",
  "otp",
  "totp",
  "sig",
  "signature",
  "signedPayload",
  "privateKey",
  "credential",
  "captchaToken",
  "state",
  "code",
]);

/**
 * Tags removed WITH their content. These are the ones browsers execute
 * (scripts) or use to exfiltrate (svg with animate, iframe, object).
 */
const DANGEROUS_TAGS = new Set([
  "script",
  "style",
  "svg",
  "iframe",
  "object",
  "embed",
  "applet",
  "meta",
  "link",
  "base",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "frame",
  "frameset",
  "marquee",
  "xml",
  "xss",
  "noscript",
  "head",
  "body",
  "html",
  "template",
]);

/**
 * HTML-entity encode < and > so any remaining tag renders as visible text.
 */
function htmlEncodeTags(input: string): string {
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sanitize a single string value.
 *
 * Strategy:
 *   1. Strip dangerous tags AND their content (non-greedy pair match, then unpaired)
 *   2. Strip event-handler attributes (on*=) from remaining tags
 *   3. Neutralize javascript: URLs
 *   4. HTML-entity-encode any remaining < or > so benign tags render as text
 *   5. Strip control characters
 */
export function sanitizeInputString(input: string): string {
  if (!input || typeof input !== "string") return input;

  let result = input;

  // 1. Remove dangerous tags WITH their content (pair match, then self-closing)
  for (const tag of DANGEROUS_TAGS) {
    // <tag ...>...</tag> (non-greedy)
    const pairRegex = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, "gi");
    result = result.replace(pairRegex, "");
    // Self-closing or unpaired: <tag ...> and <tag .../>
    const unpairedRegex = new RegExp(`<\\s*${tag}\\b[^>]*\\/?>`, "gi");
    result = result.replace(unpairedRegex, "");
  }

  // 2. Strip event-handler attributes from remaining tags (onclick=, onerror=, onbegin=, ...)
  const eventAttrRegex = /\s+\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
  result = result.replace(eventAttrRegex, "");

  // 3. Neutralize javascript: URLs — replace the entire URL value
  //    when it starts with javascript: (preserve surrounding quotes)
  const jsUrlRegex = /(\s+(?:href|src|action)\s*=\s*)["']javascript:[^"'>]*["']?/gi;
  result = result.replace(jsUrlRegex, '$1"#"');

  // 4. Strip HTML comments (can be used to break out of attribute contexts)
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // 5. HTML-entity-encode remaining angle brackets so any non-dangerous
  //    tags (<img>, <a>, <div>) render as text, not markup
  result = htmlEncodeTags(result);

  // 6. Strip C0 control characters (except \n \r \t). Matching them literally
  // is the intent here, so the control-char-in-regex lint is suppressed.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately strips C0 control chars
  result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  return result;
}

/**
 * Deep-clone + sanitize an object tree, skipping sensitive fields.
 */
function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj; // guard against circular / deeply nested
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeInputString(obj);
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = value; // byte-for-byte pass-through
    } else {
      result[key] = sanitizeObject(value, depth + 1);
    }
  }
  return result;
}

/** Content types excluded from sanitization (signed payloads). */
const EXCLUDED_CONTENT_TYPES = new Set([
  "application/secevent+jwt",
  "application/jose",
  "application/jwt",
]);

/**
 * Path prefixes excluded from sanitization.
 * SSF and Stripe webhook receivers verify a signature over the raw JSON body —
 * parsing or mutating the payload would invalidate the signature, so these
 * routes opt out.
 */
const EXCLUDED_PATH_PREFIXES = ["/ssf/", "/billing/webhook"];

/**
 * Hono middleware that sanitizes JSON bodies, query params, path params,
 * and form fields before they reach route handlers.
 */
export function inputSanitizationMiddleware() {
  return async (c: Context, next: Next) => {
    const contentType = c.req.header("content-type") || "";

    // Skip signed payloads — signature verification needs raw bytes
    if ([...EXCLUDED_CONTENT_TYPES].some((ct) => contentType.includes(ct))) {
      return next();
    }

    // Skip routes that need raw body integrity (SSF / Stripe signature verification)
    const path = c.req.path;
    if (EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    const method = c.req.method;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const isJson = contentType.includes("application/json");
      const isForm =
        contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded");

      if (isJson) {
        try {
          const body = await c.req.json();
          const sanitized = sanitizeObject(body);
          // @ts-expect-error — override json() return type (T vs unknown)
          c.req.json = async () => sanitized;
        } catch {
          // Invalid JSON — let the handler return 400
        }
      }

      if (isForm) {
        try {
          const form: any = await c.req.formData();
          const sanitized = new FormData();
          form.forEach((value: FormDataEntryValue, key: string) => {
            if (value instanceof File) {
              sanitized.append(key, value);
            } else if (SENSITIVE_FIELDS.has(key)) {
              sanitized.append(key, value);
            } else {
              sanitized.append(key, sanitizeInputString(String(value)));
            }
          });
          c.req.formData = async () => sanitized;
        } catch {
          // Invalid form — let the handler return 400
        }
      }
    }

    // Sanitize query params (override accessor)
    const rawQueries: Record<string, string> = {};
    for (const [key, value] of Object.entries(c.req.query())) {
      rawQueries[key] = SENSITIVE_FIELDS.has(key) ? value : sanitizeInputString(value);
    }
    c.req.query = ((key?: string) => {
      if (key === undefined) return rawQueries;
      return rawQueries[key];
    }) as typeof c.req.query;

    // Sanitize path params — preserve original param() and wrap it
    const originalParam = c.req.param.bind(c.req);
    const rawParams: Record<string, string> = {};
    try {
      const params = c.req.param();
      for (const [key, value] of Object.entries(params)) {
        rawParams[key] = SENSITIVE_FIELDS.has(key) ? value : sanitizeInputString(value);
      }
    } catch {
      // params not populated yet — wrap the accessor to sanitize on demand
    }
    c.req.param = ((key?: string) => {
      if (key === undefined) return { ...rawParams };
      if (key in rawParams) return rawParams[key];
      // Fallback to original for params not yet captured
      const val = originalParam(key);
      return SENSITIVE_FIELDS.has(key) ? val : sanitizeInputString(val ?? "");
    }) as typeof c.req.param;

    return next();
  };
}
