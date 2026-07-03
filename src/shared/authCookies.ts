import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

/** httpOnly refresh-token cookie (ADR 008 Option C). Scoped to the refresh route only. */
export const REFRESH_TOKEN_COOKIE = "za_refresh_token";
const REFRESH_COOKIE_PATH = "/auth/token/refresh";

export function setRefreshTokenCookie(c: Context, token: string, maxAgeSecs: number): void {
  setCookie(c, REFRESH_TOKEN_COOKIE, token, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: maxAgeSecs,
  });
}

export function clearRefreshTokenCookie(c: Context): void {
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export function readRefreshTokenFromRequest(c: Context, bodyToken?: string): string | undefined {
  return bodyToken?.trim() || getCookie(c, REFRESH_TOKEN_COOKIE);
}
