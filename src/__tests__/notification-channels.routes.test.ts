import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// authMiddleware is mocked so we can drive the admin guard from a test header:
//   x-test-role: "none" → no user set (simulates unauthenticated)
//   x-test-role: "user" → non-admin user
//   (default)           → admin user
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    const role = c.req.header("x-test-role");
    if (role === "none") return next();
    c.set("user", { id: "admin-1", email: "admin@example.com", roles: [role || "admin"] });
    await next();
  }),
}));

import { notificationDispatcher } from "../notifications/dispatcher";
import notificationChannelRoutes from "../notifications/routes";

function makeApp() {
  const app = new Hono();
  app.route("/admin/notifications", notificationChannelRoutes as any);
  return app;
}

function postJson(app: Hono, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const slackChannel = {
  type: "slack",
  name: "Test Slack",
  enabled: true,
  events: ["anomaly.detected"],
  config: { webhookUrl: "https://hooks.slack.example/T000/B000/xxx" },
};

describe("notification channel routes (admin)", () => {
  beforeEach(() => {
    // Reset the in-memory dispatcher between tests.
    for (const ch of notificationDispatcher.getChannels()) {
      notificationDispatcher.removeChannel(ch.id);
    }
  });

  afterEach(() => vi.restoreAllMocks());

  describe("admin guard", () => {
    it("rejects unauthenticated callers with 401", async () => {
      const res = await makeApp().request("/admin/notifications/channels", {
        headers: { "x-test-role": "none" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects non-admin callers with 403", async () => {
      const res = await makeApp().request("/admin/notifications/channels", {
        headers: { "x-test-role": "user" },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("CRUD", () => {
    it("adds a channel (201) and lists it", async () => {
      const app = makeApp();
      const created = await postJson(app, "/admin/notifications/channels", slackChannel);
      expect(created.status).toBe(201);
      const channel = await created.json();
      expect(channel.id).toBeTruthy();
      expect(channel.type).toBe("slack");

      const listed = await app.request("/admin/notifications/channels");
      expect(listed.status).toBe(200);
      const { channels } = await listed.json();
      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe(channel.id);
    });

    it("returns configured channels via /config", async () => {
      const app = makeApp();
      await postJson(app, "/admin/notifications/channels", slackChannel);
      const res = await app.request("/admin/notifications/config");
      expect(res.status).toBe(200);
      expect((await res.json()).channels).toHaveLength(1);
    });

    it("updates a channel via PATCH", async () => {
      const app = makeApp();
      const created = await postJson(app, "/admin/notifications/channels", slackChannel);
      const { id } = await created.json();

      const patched = await app.request(`/admin/notifications/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      expect(patched.status).toBe(200);
      expect((await patched.json()).updated).toBe(true);

      const found = notificationDispatcher.getChannels().find((c) => c.id === id);
      expect(found?.enabled).toBe(false);
    });

    it("deletes a channel via DELETE", async () => {
      const app = makeApp();
      const created = await postJson(app, "/admin/notifications/channels", slackChannel);
      const { id } = await created.json();

      const deleted = await app.request(`/admin/notifications/channels/${id}`, {
        method: "DELETE",
        headers: { "x-test-role": "admin" },
      });
      expect(deleted.status).toBe(200);
      expect((await deleted.json()).deleted).toBe(true);
      expect(notificationDispatcher.getChannels()).toHaveLength(0);
    });
  });

  describe("test endpoints", () => {
    it("POST /test succeeds (no matching channels → no network)", async () => {
      const res = await postJson(makeApp(), "/admin/notifications/test", { message: "hi" });
      expect(res.status).toBe(200);
      expect((await res.json()).sent).toBe(true);
    });

    it("POST /channels/:id/test returns 404 for an unknown channel", async () => {
      const res = await postJson(makeApp(), "/admin/notifications/channels/nope/test", {});
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("channel_not_found");
    });

    it("POST /channels/:id/test dispatches to an existing channel", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 200 }));
      const app = makeApp();
      const created = await postJson(app, "/admin/notifications/channels", slackChannel);
      const { id } = await created.json();

      const res = await postJson(app, `/admin/notifications/channels/${id}/test`, {});
      expect(res.status).toBe(200);
      expect((await res.json()).sent).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
