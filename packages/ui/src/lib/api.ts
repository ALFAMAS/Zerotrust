import { clearToken, getRefreshToken, getToken, setToken } from "./auth";
import { enqueueWrite, isQueueableMethod } from "./offlineQueue";
import { navigateToSafeRelative, safeRelativeRedirect } from "./safeRedirect";

/** Thrown when a mutation is queued offline instead of reaching the server. */
export class OfflineQueuedError extends Error {
  queued = true;
  constructor() {
    super("You're offline — this change was queued and will sync when you reconnect.");
    this.name = "OfflineQueuedError";
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:3000";

/** Request timeout in milliseconds before we abort and may retry. */
const FETCH_TIMEOUT_MS = 15_000;

/** Maximum number of retry attempts for transient failures (network error or 5xx). */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). Actual delay = BASE_RETRY_DELAY * 2^attempt. */
const BASE_RETRY_DELAY_MS = 500;

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * When an access token expires we get a single 401. We try to silently mint a
 * fresh access token from the stored refresh token and replay the request once.
 * Concurrent 401s share one in-flight refresh so we never stampede the endpoint.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
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

function redirectToLogin(): void {
  clearToken();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const next = encodeURIComponent(
      safeRelativeRedirect(window.location.pathname + window.location.search, "/dashboard")
    );
    navigateToSafeRelative(`/login?next=${next}`, "/login");
  }
}

/** Perform a fetch with a timeout. Returns the Response or throws on timeout. */
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

// ── Request dedup/caching ─────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const DEFAULT_CACHE_TTL_MS = 30_000; // 30 seconds default cache TTL

function cacheKey(method: string, path: string): string {
  return `${method}:${path}`;
}

function getCached<T>(key: string): T | null {
  const entry = requestCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  if (entry) requestCache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_CACHE_TTL_MS): void {
  // Bounded cache: evict oldest 25% when full
  if (requestCache.size >= 1000) {
    const entries = [...requestCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const evictCount = Math.floor(1000 * 0.25);
    for (let i = 0; i < evictCount; i++) requestCache.delete(entries[i][0]);
  }
  requestCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function invalidateCache(pathPrefix: string): void {
  for (const key of requestCache.keys()) {
    if (key.includes(pathPrefix)) requestCache.delete(key);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  skipAuth = false,
  isRetry = false,
  cacheTtlMs?: number
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token && !skipAuth) headers.Authorization = `Bearer ${token}`;
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

  // GET requests: check cache first, dedup concurrent requests.
  // A replay after a 401→refresh (isRetry) must NOT consult the dedup map: the
  // parent request is still in flight under the same key, so returning it here
  // would make the replay await the very promise it is running inside — a
  // deadlock that hangs every token-refreshed GET.
  if (method === "GET" && !isRetry) {
    const key = cacheKey(method, path);
    const cached = getCached<T>(key);
    if (cached !== null) return cached;

    // Dedup concurrent requests for the same resource
    const existing = inFlightRequests.get(key);
    if (existing) return existing as Promise<T>;
  }

  const requestPromise = (async (): Promise<T> => {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }

      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${BASE_URL}${path}`,
          { method, headers, body: serializedBody },
          FETCH_TIMEOUT_MS
        );
      } catch (networkErr) {
        if (
          typeof navigator !== "undefined" &&
          !navigator.onLine &&
          isQueueableMethod(method) &&
          !isRetry
        ) {
          await enqueueWrite({
            url: `${BASE_URL}${path}`,
            method,
            headers,
            body: serializedBody,
            queuedAt: Date.now(),
          }).catch(() => {});
          throw new OfflineQueuedError();
        }
        lastErr = networkErr;
        continue;
      }

      if (res.status === 401 && !skipAuth && !isRetry && getRefreshToken()) {
        refreshInFlight = refreshInFlight ?? refreshAccessToken();
        const refreshed = await refreshInFlight;
        refreshInFlight = null;
        if (refreshed) {
          return request<T>(method, path, body, skipAuth, true, cacheTtlMs);
        }
        redirectToLogin();
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw Object.assign(new Error(err.message || `HTTP ${res.status}`), {
          code: err.code,
          status: res.status,
        });
      }

      if (res.status === 204) return undefined as unknown as T;
      const data = await res.json();

      // Cache GET responses
      if (method === "GET") {
        const key = cacheKey(method, path);
        setCache(key, data, cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
      }

      return data;
    }

    throw lastErr;
  })();

  // Track in-flight GET requests for dedup (never for a replay — see above).
  if (method === "GET" && !isRetry) {
    const key = cacheKey(method, path);
    inFlightRequests.set(key, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inFlightRequests.delete(key);
    }
  }

  return requestPromise;
}

export const api = {
  get: <T>(path: string, cacheTtlMs?: number) =>
    request<T>("GET", path, undefined, false, false, cacheTtlMs),
  post: <T>(path: string, body?: unknown, skipAuth = false) => {
    // Invalidate related cache entries on mutation
    invalidateCache(path.split("/").slice(0, -1).join("/"));
    return request<T>("POST", path, body, skipAuth);
  },
  patch: <T>(path: string, body?: unknown) => {
    invalidateCache(path.split("/").slice(0, -1).join("/"));
    return request<T>("PATCH", path, body);
  },
  put: <T>(path: string, body?: unknown) => {
    invalidateCache(path.split("/").slice(0, -1).join("/"));
    return request<T>("PUT", path, body);
  },
  delete: <T>(path: string) => {
    invalidateCache(path.split("/").slice(0, -1).join("/"));
    return request<T>("DELETE", path);
  },
  /** Manually invalidate cache entries matching a path prefix */
  invalidateCache,
};
