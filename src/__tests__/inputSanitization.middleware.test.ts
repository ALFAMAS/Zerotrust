import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { inputSanitizationMiddleware, sanitizeInputString } from "../middleware/inputSanitization";

describe("input sanitization middleware", () => {
  it("sanitizes nested JSON strings while preserving sensitive fields", async () => {
    const app = new Hono();
    app.use("*", inputSanitizationMiddleware());
    app.post("/profile", async (c) => c.json(await c.req.json()));

    const res = await app.request("/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: '<img src=x onerror="alert(1)">Alice<script>alert("x")</script>',
        password: 'keep<raw>&"password"',
        nested: {
          bio: '<svg><animate onbegin="alert(1)" /></svg>hello',
          refreshToken: "refresh<script>must-stay-raw</script>",
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayName).toBe("&lt;img src=x&gt;Alice");
    expect(body.nested.bio).toBe("hello");
    expect(body.password).toBe('keep<raw>&"password"');
    expect(body.nested.refreshToken).toBe("refresh<script>must-stay-raw</script>");
    expect(JSON.stringify(body.displayName)).not.toMatch(/<script|onerror|javascript:/i);
    expect(JSON.stringify(body.nested.bio)).not.toMatch(/<svg|onbegin/i);
  });

  it("sanitizes query and path params globally but preserves sensitive query keys", async () => {
    const app = new Hono();
    app.use("*", inputSanitizationMiddleware());
    app.get("/search/:slug", (c) =>
      c.json({
        all: c.req.query(),
        q: c.req.query("q"),
        slug: c.req.param("slug"),
        token: c.req.query("token"),
      })
    );

    const res = await app.request(
      "/search/%3Cimg%20src=x%20onerror=alert(1)%3E?q=%3Cscript%3Ebad()%3C%2Fscript%3Eok&token=%3Cscript%3Eraw%3C%2Fscript%3E"
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.q).toBe("ok");
    expect(body.all.q).toBe("ok");
    expect(body.slug).toBe("&lt;img src=x&gt;");
    expect(body.token).toBe("<script>raw</script>");
  });

  it("sanitizes form fields without mutating uploaded files", async () => {
    const app = new Hono();
    app.use("*", inputSanitizationMiddleware());
    app.post("/upload", async (c) => {
      const form = await c.req.formData();
      const file = form.get("file") as File;
      return c.json({
        description: form.get("description"),
        fileName: file.name,
        fileType: file.type,
        fileText: await file.text(),
      });
    });

    const form = new FormData();
    form.append("description", '<iframe src="javascript:alert(1)"></iframe>report');
    form.append("file", new File(["<svg><script>kept in file</script></svg>"], "payload.svg", {
      type: "image/svg+xml",
    }));

    const res = await app.request("/upload", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("report");
    expect(body.fileName).toBe("payload.svg");
    expect(body.fileType).toBe("image/svg+xml");
    expect(body.fileText).toBe("<svg><script>kept in file</script></svg>");
  });

  it("does not mutate signed SSF JSON bodies before signature verification", async () => {
    const app = new Hono();
    app.use("*", inputSanitizationMiddleware());
    app.post("/ssf/events", async (c) => c.json(await c.req.json()));

    const rawPayload = { subject: '<script>alert("signed")</script>' };
    const res = await app.request("/ssf/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rawPayload),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(rawPayload);
  });
});

describe("sanitizeInputString", () => {
  it("neutralizes common XSS primitives", () => {
    expect(
      sanitizeInputString(
        '<a href="javascript:alert(1)" onclick="alert(2)">open</a><!--x--><script>bad()</script>'
      )
    ).toBe('&lt;a href="#"&gt;open&lt;/a&gt;');
  });
});
