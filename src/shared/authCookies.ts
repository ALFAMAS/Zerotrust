import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

/** httpOnly refresh-token cookie (ADR 008 Option C). __Host- prefix enforces host-only binding (SEC-9). */
export const REFRESH_TOKEN_COOKIE = "__Host-za_refresh_token";
/** Pre-SEC-9 cookie name — read/clear during migration. */
export const LEGACY_REFRESH_TOKEN_COOKIE = "za_refresh_token";
const REFRESH_COOKIE_PATH = "/";
const LEGACY_REFRESH_COOKIE_PATH = "/auth/token/refresh";

export function setRefreshTokenCookie(c: Context, token: string, maxAgeSecs: number): void {
  setCookie(c, REFRESH_TOKEN_COOKIE, token, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: maxAgeSecs,
  });
  // Clear legacy cookie at its old path so clients don't carry two refresh cookies.
  deleteCookie(c, LEGACY_REFRESH_TOKEN_COOKIE, {
    path: LEGACY_REFRESH_COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearRefreshTokenCookie(c: Context): void {
  deleteCookie(c, REFRESH_TOKEN_COOKIE, {
    path: REFRESH_COOKIE_PATH,
    secure: true,
  });
  deleteCookie(c, LEGACY_REFRESH_TOKEN_COOKIE, {
    path: LEGACY_REFRESH_COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
  });
}

export function readRefreshTokenFromRequest(c: Context, bodyToken?: string): string | undefined {
  return (
    bodyToken?.trim() ||
    getCookie(c, REFRESH_TOKEN_COOKIE) ||
    getCookie(c, LEGACY_REFRESH_TOKEN_COOKIE)
  );
}
