import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "../../db/index";
import { pushSubscriptionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("web-push");

/**
 * Web Push (RFC 8030/8291) delivery.
 *
 * VAPID keys are read from the environment. When they are absent the service
 * degrades gracefully: subscriptions can still be stored, but `sendWebPush`
 * becomes a no-op so the rest of the notification pipeline (SSE + email
 * fallback) is unaffected. Generate a key pair with:
 *
 *   npx web-push generate-vapid-keys
 */

let configured = false;

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
  type?: string;
  tag?: string;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isWebPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@zerotrust.local",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
  return true;
}

/**
 * Persist (or refresh) a browser push subscription for a user. Idempotent on
 * the endpoint — re-subscribing the same endpoint just updates its keys/owner.
 */
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  const db = getDb();
  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
      },
    });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const db = getDb();
  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, userId))
    );
}

/**
 * Send a push message to every subscription a user has. Dead endpoints
 * (404/410 — unsubscribed or expired) are pruned automatically. Returns the
 * number of subscriptions that accepted the message.
 */
export async function sendWebPush(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const db = getDb();
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        delivered++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          logger.warn("Web push delivery failed", {
            statusCode,
            endpoint: s.endpoint,
          });
        }
      }
    })
  );

  if (deadEndpoints.length > 0) {
    await db
      .delete(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.endpoint, deadEndpoints));
    logger.info("Pruned expired push subscriptions", {
      count: deadEndpoints.length,
    });
  }

  return delivered;
}
