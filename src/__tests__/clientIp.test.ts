import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { getClientIp } from "../shared/clientIp";

function appWith(handler: (c: Parameters<typeof getClientIp>[0]) => Response) {
  const app = new Hono();
  app.get("/ip", (c) => handler(c));
  return app;
}

describe("shared/clientIp", () => {
  it("prefers the first x-forwarded-for hop", async () => {
    const app = appWith((c) => new Response(getClientIp(c)));
    const res = await app.request("/ip", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(await res.text()).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip then cf-connecting-ip", async () => {
    const real = appWith((c) => new Response(getClientIp(c)));
    expect(
      await (await real.request("/ip", { headers: { "x-real-ip": "198.51.100.2" } })).text()
    ).toBe("198.51.100.2");

    const cf = appWith((c) => new Response(getClientIp(c)));
    expect(
      await (await cf.request("/ip", { headers: { "cf-connecting-ip": "192.0.2.55" } })).text()
    ).toBe("192.0.2.55");
  });

  it("reads the socket remote address from c.env.incoming", async () => {
    const app = new Hono();
    app.get("/ip", (c) => {
      c.env = {
        incoming: { socket: { remoteAddress: "::ffff:127.0.0.1" } },
      } as never;
      return new Response(getClientIp(c));
    });
    const res = await app.request("/ip");
    expect(await res.text()).toBe("127.0.0.1");
  });

  it("returns an empty string when no headers or socket are present", async () => {
    const app = appWith((c) => new Response(getClientIp(c)));
    const res = await app.request("/ip");
    expect(await res.text()).toBe("");
  });
});
