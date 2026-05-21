import { ZeroAuthSDKError, SDKErrorCodes } from "./errors";
import type { TokenStorage } from "./types";
import { ACCESS_TOKEN_KEY } from "./token-storage";

export class HttpClient {
  private baseUrl: string;
  private storage: TokenStorage;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private onRefreshFailed?: (err: Error) => void;
  private refreshInProgress: Promise<string | null> | null = null;

  constructor(opts: {
    baseUrl: string;
    storage: TokenStorage;
    timeout?: number;
    defaultHeaders?: Record<string, string>;
    onRefreshFailed?: (err: Error) => void;
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.storage = opts.storage;
    this.timeout = opts.timeout ?? 30_000;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.onRefreshFailed = opts.onRefreshFailed;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { skipAuth?: boolean; skipRefresh?: boolean } = {}
  ): Promise<T> {
    const token = await this.storage.get(ACCESS_TOKEN_KEY);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
    };

    if (token && !opts.skipAuth) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as Error).name === "AbortError") {
        throw new ZeroAuthSDKError(SDKErrorCodes.TIMEOUT, "Request timed out", 0);
      }
      throw new ZeroAuthSDKError(
        SDKErrorCodes.NETWORK_ERROR,
        (err as Error).message || "Network error",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Auto-refresh on 401
    if (response.status === 401 && !opts.skipRefresh && !opts.skipAuth) {
      try {
        const newToken = await this.doRefresh();
        if (newToken) {
          return this.request<T>(method, path, body, { ...opts, skipRefresh: true });
        }
      } catch {
        // refresh failed, fall through to throw the 401
      }
    }

    if (!response.ok) {
      let errorBody: { code?: string; message?: string; details?: unknown[] } = {};
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { message: response.statusText };
      }
      throw ZeroAuthSDKError.fromApiResponse(response.status, errorBody as any);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, opts?: { skipAuth?: boolean }): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }

  post<T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async doRefresh(): Promise<string | null> {
    if (this.refreshInProgress) return this.refreshInProgress;

    this.refreshInProgress = (async () => {
      try {
        const { REFRESH_TOKEN_KEY } = await import("./token-storage");
        const refreshToken = await this.storage.get(REFRESH_TOKEN_KEY);
        if (!refreshToken) return null;

        const response = await fetch(`${this.baseUrl}/auth/token/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.accessToken) {
          await this.storage.set(ACCESS_TOKEN_KEY, data.accessToken);
          if (data.refreshToken) {
            await this.storage.set(REFRESH_TOKEN_KEY, data.refreshToken);
          }
          return data.accessToken as string;
        }
        return null;
      } catch (err) {
        this.onRefreshFailed?.(err as Error);
        return null;
      } finally {
        this.refreshInProgress = null;
      }
    })();

    return this.refreshInProgress;
  }
}
