import { Hono } from "hono";
import type { HonoEnv } from "../shared/types";
import { notificationDispatcher } from "./dispatcher";

const app = new Hono<HonoEnv>();

// POST /test — send a test notification
app.post("/test", async (c) => {
  const body = await c.req.json<{ channel?: string; target?: string; message?: string }>();
  const { message } = body;

  try {
    await notificationDispatcher.dispatch("anomaly.detected", {
      type: "test",
      message: message ?? "This is a test notification from ZeroAuth",
      timestamp: new Date().toISOString(),
    });
    return c.json({ sent: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// GET /config — return configured notification channels
app.get("/config", (c) => {
  const channels = notificationDispatcher.getChannels();
  return c.json({ channels });
});

// GET /channels — list channels (optionally filtered by tenantId)
app.get("/channels", (c) => {
  const tenantId = c.req.query("tenantId");
  return c.json({ channels: notificationDispatcher.getChannels(tenantId) });
});

// POST /channels — add a channel
app.post("/channels", async (c) => {
  const body = await c.req.json();
  const channel = notificationDispatcher.addChannel(body);
  return c.json(channel, 201);
});

// PATCH /channels/:id — update a channel
app.patch("/channels/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  notificationDispatcher.updateChannel(id, body);
  return c.json({ updated: true });
});

// DELETE /channels/:id — remove a channel
app.delete("/channels/:id", (c) => {
  const id = c.req.param("id");
  notificationDispatcher.removeChannel(id);
  return c.json({ deleted: true });
});

// POST /channels/:id/test — send a test to a specific channel
app.post("/channels/:id/test", async (c) => {
  const id = c.req.param("id");
  const channels = notificationDispatcher.getChannels();
  const channel = channels.find((ch) => ch.id === id);

  if (!channel) {
    return c.json({ error: "channel_not_found" }, 404);
  }

  try {
    await notificationDispatcher.dispatch("anomaly.detected", {
      type: "test",
      message: "This is a test notification from ZeroAuth",
      timestamp: new Date().toISOString(),
    });
    return c.json({ sent: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default app;
