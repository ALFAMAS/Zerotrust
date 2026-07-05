import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  LEGACY_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearRefreshTokenCookie,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from "../shared/authCookies";

describe("authCookies (SEC-9)", () => {
  it("sets __Host- refresh cookie with path=/ and clears legacy cookie", async () => {
    const app = new Hono();
    app.get("/set", (c) => {
      setRefreshTokenCookie(c, "rt-secret", 3600);
      return c.text("ok");
    });
    const res = await app.request("/set");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFRESH_TOKEN_COOKIE}=rt-secret`);
    expect(setCookie).toContain("Path=/");
    expect(setCookie.toLowerCase()).toContain("secure");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("clears both host and legacy refresh cookies on logout", async () => {
    const app = new Hono();
    app.post("/clear", (c) => {
      clearRefreshTokenCookie(c);
      return c.json({ success: true });
    });
    const res = await app.request("/clear", { method: "POST" });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie?.() ?? [];
    const names = cookies.map((c) => c.split("=")[0]);
    expect(names).toContain(REFRESH_TOKEN_COOKIE);
    expect(names).toContain(LEGACY_REFRESH_TOKEN_COOKIE);
  });

  it("reads refresh token from new or legacy cookie name", async () => {
    const app = new Hono();
    app.get("/read", (c) => {
      const token = readRefreshTokenFromRequest(c);
      return c.json({ token });
    });
    const hostRes = await app.request("/read", {
      headers: { Cookie: `${REFRESH_TOKEN_COOKIE}=host-token` },
    });
    expect((await hostRes.json()).token).toBe("host-token");

    const legacyRes = await app.request("/read", {
      headers: { Cookie: `${LEGACY_REFRESH_TOKEN_COOKIE}=legacy-token` },
    });
    expect((await legacyRes.json()).token).toBe("legacy-token");
  });
});
