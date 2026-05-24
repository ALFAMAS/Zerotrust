import { Router } from "express";
import { notificationDispatcher } from "./dispatcher";

const router = Router();

router.get("/channels", (req, res) => {
  const { tenantId } = req.query as Record<string, string>;
  res.json({ channels: notificationDispatcher.getChannels(tenantId) });
});

router.post("/channels", (req, res) => {
  const channel = notificationDispatcher.addChannel(req.body);
  res.status(201).json(channel);
});

router.put("/channels/:id", (req, res) => {
  notificationDispatcher.updateChannel(req.params.id, req.body);
  res.json({ updated: true });
});

router.delete("/channels/:id", (req, res) => {
  notificationDispatcher.removeChannel(req.params.id);
  res.json({ deleted: true });
});

router.post("/channels/:id/test", async (req, res) => {
  const channels = notificationDispatcher.getChannels();
  const channel = channels.find(c => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: "channel_not_found" });
  try {
    await notificationDispatcher.dispatch("anomaly.detected", {
      type: "test",
      message: "This is a test notification from ZeroAuth",
      timestamp: new Date().toISOString(),
    });
    res.json({ sent: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
