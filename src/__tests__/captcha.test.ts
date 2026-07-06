import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const ORIGINAL_ENV = { ...process.env };

describe("captchaGuard middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CAPTCHA_ENABLED;
    delete process.env.CAPTCHA_SECRET;
    delete process.env.CAPTCHA_PROVIDER;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("passes through when CAPTCHA is disabled", async () => {
    const { captchaGuard } = await import("../middleware/captcha");
    const app = new Hono();
    app.post("/login", captchaGuard(), (c) => c.json({ ok: true }));

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns 400 when enabled but captchaToken is missing", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET = "test-secret";

    const { captchaGuard } = await import("../middleware/captcha");
    const app = new Hono();
    app.post("/login", captchaGuard(), (c) => c.json({ ok: true }));

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "CAPTCHA_REQUIRED" });
  });

  it("returns 403 when provider rejects the token", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET = "test-secret";
    process.env.CAPTCHA_PROVIDER = "turnstile";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      })
    );

    const { captchaGuard } = await import("../middleware/captcha");
    const app = new Hono();
    app.post("/login", captchaGuard(), (c) => c.json({ ok: true }));

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "a@example.com",
        password: "secret",
        captchaToken: "bad-token",
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "CAPTCHA_FAILED" });
  });

  it("passes when provider accepts the token", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET = "test-secret";
    process.env.CAPTCHA_PROVIDER = "turnstile";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );

    const { captchaGuard } = await import("../middleware/captcha");
    const app = new Hono();
    app.post("/login", captchaGuard(), (c) => c.json({ ok: true }));

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "a@example.com",
        password: "secret",
        captchaToken: "good-token",
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("verifyCaptchaToken service", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CAPTCHA_ENABLED;
    delete process.env.CAPTCHA_SECRET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("is a no-op when disabled", async () => {
    const { verifyCaptchaToken } = await import("../services/auth/captcha.service");
    const result = await verifyCaptchaToken("");
    expect(result).toEqual({ ok: true });
  });

  it("calls the turnstile verify endpoint when enabled", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET = "test-secret";
    process.env.CAPTCHA_PROVIDER = "turnstile";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { verifyCaptchaToken } = await import("../services/auth/captcha.service");
    const result = await verifyCaptchaToken("token-123", "203.0.113.1");
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("secret=test-secret");
    expect(String(init.body)).toContain("response=token-123");
    expect(String(init.body)).toContain("remoteip=203.0.113.1");
  });
});
