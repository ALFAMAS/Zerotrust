import type { TokenStorage } from "./types";

const ACCESS_TOKEN_KEY = "za_access_token";
const REFRESH_TOKEN_KEY = "za_refresh_token";

// ─── Memory ───────────────────────────────────────────────────────────────────

export class MemoryTokenStorage implements TokenStorage {
  private store = new Map<string, string>();

  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

// ─── localStorage ─────────────────────────────────────────────────────────────

export class LocalStorageTokenStorage implements TokenStorage {
  get(key: string): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  }

  set(key: string, value: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  }

  remove(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  }
}

// ─── Cookie ───────────────────────────────────────────────────────────────────

export class CookieTokenStorage implements TokenStorage {
  constructor(private readonly options: { secure?: boolean; sameSite?: string } = {}) {}

  get(key: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRegExp(key)}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  set(key: string, value: string): void {
    if (typeof document === "undefined") return;
    const secure = this.options.secure !== false ? "; secure" : "";
    const sameSite = this.options.sameSite || "lax";
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; samesite=${sameSite}${secure}`;
  }

  remove(key: string): void {
    if (typeof document === "undefined") return;
    document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTokenStorage(type: "memory" | "localStorage" | "cookie"): TokenStorage {
  switch (type) {
    case "localStorage":
      return new LocalStorageTokenStorage();
    case "cookie":
      return new CookieTokenStorage();
    default:
      return new MemoryTokenStorage();
  }
}

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };
