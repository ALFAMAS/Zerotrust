import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../../db";
import { notificationsTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

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
 * Called from other route files after creating a notification row.
 */
export function broadcastNotification(
  userId: string,
  notification: Record<string, unknown>
): void {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
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
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.read, false)
        )
      );
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
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.userId, user.id)
        )
      )
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
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.read, false)
        )
      );
    return c.json({ success: true });
  } catch (err) {
    logger.error("Mark all notifications read error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to mark all notifications as read" }, 500);
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

export default router;
