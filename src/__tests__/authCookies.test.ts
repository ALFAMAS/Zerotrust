import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRefreshTokenCookie,
  includeLoadTestRefreshToken,
  LEGACY_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from "../shared/authCookies";

const originalNodeEnv = process.env.NODE_ENV;
const originalLoadTestTransport = process.env.LOAD_TEST_REFRESH_TOKEN_BODY;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalLoadTestTransport === undefined) delete process.env.LOAD_TEST_REFRESH_TOKEN_BODY;
  else process.env.LOAD_TEST_REFRESH_TOKEN_BODY = originalLoadTestTransport;
});

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

  it("exposes a refresh token in the body only for an explicitly enabled test load", () => {
    process.env.NODE_ENV = "test";
    process.env.LOAD_TEST_REFRESH_TOKEN_BODY = "true";

    expect(includeLoadTestRefreshToken({ accessToken: "access" }, "refresh-secret")).toEqual({
      accessToken: "access",
      refreshToken: "refresh-secret",
    });
  });

  it("never exposes a refresh token in production even when the load-test flag is set", () => {
    process.env.NODE_ENV = "production";
    process.env.LOAD_TEST_REFRESH_TOKEN_BODY = "true";

    expect(includeLoadTestRefreshToken({ accessToken: "access" }, "refresh-secret")).toEqual({
      accessToken: "access",
    });
  });
});
