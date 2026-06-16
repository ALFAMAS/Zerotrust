import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { notificationsTable, usersTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import { sendNotificationEmail } from "../../services/email.service";
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendWebPush,
} from "../../services/webPush.service";
import type { HonoEnv } from "../../shared/types";

export interface NotificationPreferences {
  emailFallback: boolean;
  emailFallbackDays: number;
}

const router = new Hono<HonoEnv>();
const logger = getLogger("notification-routes");

// ─── SSE connection registry ──────────────────────────────────────────────────

type SSEController = {
  send: (event: string, data: string) => void;
  close: () => void;
};

const sseClients = new Map<string, Set<SSEController>>();

/**
 * Broadcast a notification to all open SSE connections for a user.
 * Falls back to email if the user has no active SSE connections.
 * Called from other route files after creating a notification row.
 */
export function broadcastNotification(userId: string, notification: Record<string, unknown>): void {
  const clients = sseClients.get(userId);

  // Web push is delivered regardless of SSE state — it's the channel that works
  // when the app/PWA is closed. Best-effort and non-blocking; a no-op when VAPID
  // keys aren't configured.
  void sendWebPush(userId, {
    title: String(notification.title ?? "New notification"),
    body: String(notification.body ?? notification.message ?? ""),
    link: notification.link ? String(notification.link) : undefined,
    type: notification.type ? String(notification.type) : undefined,
  }).catch(() => {
    // non-blocking — ignore errors
  });

  if (!clients || clients.size === 0) {
    // No active SSE connections — try to deliver via email
    void (async () => {
      try {
        const db = getDb();
        const userRows = await db
          .select({ email: usersTable.email, displayName: usersTable.displayName })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const user = userRows[0];
        if (user?.email) {
          void sendNotificationEmail(user.email, {
            name: user.displayName ?? user.email,
            title: String(notification.title ?? "New notification"),
            body: String(notification.body ?? notification.message ?? ""),
            link: notification.link ? String(notification.link) : undefined,
          });
        }
      } catch {
        // non-blocking — ignore errors
      }
    })();
    return;
  }

  const payload = JSON.stringify(notification);
  for (const ctrl of clients) {
    try {
      ctrl.send("notification", payload);
    } catch {
      // ignore dead connections — they clean themselves up on close
    }
  }
}

// ─── Auth guard on all notification routes ────────────────────────────────────

router.use("*", authMiddleware);

// ─── GET /notifications ───────────────────────────────────────────────────────

router.get("/", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);
    return c.json(rows);
  } catch (err) {
    logger.error("Get notifications error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to retrieve notifications" }, 500);
  }
});

// ─── GET /notifications/unread-count ─────────────────────────────────────────

router.get("/unread-count", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
    return c.json({ count: rows.length });
  } catch (err) {
    logger.error("Get unread count error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to retrieve unread count" }, 500);
  }
});

// ─── POST /notifications/:id/read ─────────────────────────────────────────────

router.post("/:id/read", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
    }
    const id = c.req.param("id");
    const db = getDb();
    const updated = await db
      .update(notificationsTable)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
      .returning();
    if (updated.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Notification not found" }, 404);
    }
    return c.json(updated[0]);
  } catch (err) {
    logger.error("Mark notification read error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to mark notification as read" }, 500);
  }
});

// ─── POST /notifications/read-all ─────────────────────────────────────────────

router.post("/read-all", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
    }
    const db = getDb();
    await db
      .update(notificationsTable)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
    return c.json({ success: true });
  } catch (err) {
    logger.error("Mark all notifications read error", err as Error);
    return c.json(
      { error: "INTERNAL_ERROR", message: "Failed to mark all notifications as read" },
      500
    );
  }
});

// ─── GET /notifications/sse ───────────────────────────────────────────────────

router.get("/sse", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const ctrl: SSEController = {
        send(event: string, data: string) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        },
        close() {
          try {
            controller.close();
          } catch {
            // already closed
          }
        },
      };

      // Register this connection
      if (!sseClients.has(userId)) {
        sseClients.set(userId, new Set());
      }
      sseClients.get(userId)!.add(ctrl);

      // Send initial connected event
      ctrl.send("connected", JSON.stringify({ userId }));

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30_000);

      // Cleanup on stream cancel (client disconnect)
      const cleanup = () => {
        clearInterval(pingInterval);
        const set = sseClients.get(userId);
        if (set) {
          set.delete(ctrl);
          if (set.size === 0) sseClients.delete(userId);
        }
      };

      // Store cleanup on controller for cancel signal
      (controller as any)._cleanup = cleanup;
    },
    cancel() {
      // Called when the client disconnects
      const self = this as any;
      if (self._cleanup) self._cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

// ── GET /notifications/preferences ───────────────────────────────────────────

router.get("/preferences", async (c) => {
  const user = c.get("user");
  try {
    const db = getDb();
    const [row] = await db
      .select({ metadata: usersTable.metadata })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const prefs: NotificationPreferences = {
      emailFallback: true,
      emailFallbackDays: 3,
      ...(((row?.metadata as any)?.notificationPreferences as Partial<NotificationPreferences>) ??
        {}),
    };
    return c.json(prefs);
  } catch (err) {
    logger.error("Get notification preferences error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── PUT /notifications/preferences ───────────────────────────────────────────

const prefsSchema = z.object({
  emailFallback: z.boolean().optional(),
  emailFallbackDays: z.number().int().min(1).max(30).optional(),
});

router.put("/preferences", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const db = getDb();
    const [row] = await db
      .select({ metadata: usersTable.metadata })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const existingMeta = (row?.metadata as Record<string, unknown>) ?? {};
    const existingPrefs =
      (existingMeta.notificationPreferences as Partial<NotificationPreferences>) ?? {};

    await db
      .update(usersTable)
      .set({
        metadata: {
          ...existingMeta,
          notificationPreferences: { ...existingPrefs, ...parsed.data },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    return c.json({ ...existingPrefs, ...parsed.data });
  } catch (err) {
    logger.error("Update notification preferences error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Web Push subscription management ──────────────────────────────────────────

// GET /notifications/push/public-key — VAPID public key for the client to
// subscribe with. Returns null when push isn't configured on this deployment.
router.get("/push/public-key", (c) => {
  return c.json({ publicKey: getVapidPublicKey() });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// POST /notifications/push/subscribe — store a browser push subscription.
router.post("/push/subscribe", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }
  try {
    await saveSubscription(user.id, parsed.data, c.req.header("user-agent") ?? undefined);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Save push subscription error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to save subscription" }, 500);
  }
});

// POST /notifications/push/unsubscribe — remove a browser push subscription.
router.post("/push/unsubscribe", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return c.json({ error: "INVALID_REQUEST", message: "endpoint is required" }, 400);
  }
  try {
    await removeSubscription(user.id, endpoint);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Remove push subscription error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to remove subscription" }, 500);
  }
});

export default router;
