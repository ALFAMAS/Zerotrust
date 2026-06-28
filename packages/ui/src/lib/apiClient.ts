/**
 * Centralized client HTTP for the zerotrust UI.
 *
 * Why this exists:
 *   - A handful of pages were calling `fetch(${API}/...)` directly with their
 *     own Authorization header wiring, timeout logic, and error parsing.
 *     Every one of those sites was a quiet foot-gun (no timeout, accidental
 *     bearer-token omission, inconsistent 4xx handling, JSON parse crashes
 *     on non-JSON responses).
 *   - This module is the single secure HTTP boundary for the Next.js client.
 *     Callers say what they want (`apiGet`, `apiPost`, `apiPostFormData`,
 *     `apiGetBlob`, `apiDelete`); the helpers attach the auth header, set
 *     Content-Type appropriately, never let the browser leak tokens to a
 *     cross-origin host (same-origin BASE_URL enforced), and surface a
 *     consistent `{ message, code, status }` error shape.
 *
 * Same-origin requirement (CWE-601/CWE-918 hygiene):
 *   - BASE_URL comes from `NEXT_PUBLIC_ZEROTRUST_URL`. All callers therefore
 *     hit the configured API origin and never a user-influenced host.
 *   - We do not accept `fetch(arbitrary URL)` here; callers that need to hit
 *     trusted third-party hosts (OAuth/Stripe) must do so via a narrow
 *     `safeExternalRedirect` flow, not raw `fetch`.
 */

import { clearToken, getRefreshToken, getToken, setToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:1337";

/** Request timeout in milliseconds before we abort and may retry. */
const FETCH_TIMEOUT_MS = 15_000;

export interface ApiError extends Error {
  code?: string;
  status: number;
}

export interface ApiClientOptions {
  /** Skip attaching the Bearer access token (e.g. login / register / public). */
  skipAuth?: boolean;
  /** Per-request timeout override (ms). Defaults to FETCH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Extra headers to merge in (e.g. `x-workload-key` for workload issue). */
  extraHeaders?: Record<string, string>;
}

function buildAuthHeaders(skipAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (!skipAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${BASE_URL}/auth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);
  if (!res?.ok) return false;
  const data = await res.json().catch(() => null);
  if (!data?.accessToken) return false;
  setToken(data.accessToken, data.refreshToken);
  return true;
}

async function dispatch<T>(
  method: string,
  path: string,
  init: Omit<RequestInit, "method" | "signal">,
  options: ApiClientOptions = {},
  isRetry = false
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    ...buildAuthHeaders(Boolean(options.skipAuth)),
    ...(options.extraHeaders ?? {}),
  };

  const res = await fetchWithTimeout(
    url,
    { ...init, method, headers },
    options.timeoutMs ?? FETCH_TIMEOUT_MS
  );

  if (res.status === 401 && !options.skipAuth && !isRetry && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return dispatch<T>(method, path, init, options, true);
    }
    clearToken();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!res.ok) {
    const errBody = (parsed as { message?: string; code?: string } | null) ?? {};
    const err = Object.assign(new Error(errBody.message || `HTTP ${res.status}`), {
      code: errBody.code,
      status: res.status,
    }) as ApiError;
    throw err;
  }

  return parsed as T;
}

/** GET a JSON resource. */
export function apiGet<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  return dispatch<T>("GET", path, {}, options);
}

/** POST a JSON body. */
export function apiPost<T>(
  path: string,
  body: unknown,
  options: ApiClientOptions = {}
): Promise<T> {
  return dispatch<T>(
    "POST",
    path,
    {
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options
  );
}

/**
 * POST a FormData payload (file uploads, etc.). We deliberately do NOT set a
 * Content-Type here so the browser can attach the correct multipart boundary.
 */
export function apiPostFormData<T>(
  path: string,
  formData: FormData,
  options: ApiClientOptions = {}
): Promise<T> {
  return dispatch<T>("POST", path, { body: formData }, options);
}

/**
 * POST and parse the response as JSON. Mirrors `apiPost` but is the explicit
 * helper for endpoints that return a small JSON envelope (e.g. OAuth
 * authorize returns `{ authorizeUrl }`).
 */
export function apiPostRaw<T>(
  path: string,
  body: unknown,
  options: ApiClientOptions = {}
): Promise<T> {
  return apiPost<T>(path, body, options);
}

/** GET a binary/blob response (CSV / JSON exports). Returns the raw Blob. */
export async function apiGetBlob(path: string, options: ApiClientOptions = {}): Promise<Blob> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    ...buildAuthHeaders(Boolean(options.skipAuth)),
    ...(options.extraHeaders ?? {}),
  };
  const res = await fetchWithTimeout(
    url,
    { method: "GET", headers },
    options.timeoutMs ?? FETCH_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || `HTTP ${res.status}`), {
      status: res.status,
    }) as ApiError;
  }
  return res.blob();
}

/** DELETE a resource. */
export function apiDelete<T = unknown>(path: string, options: ApiClientOptions = {}): Promise<T> {
  return dispatch<T>("DELETE", path, {}, options);
}

export { BASE_URL as API_BASE_URL };
