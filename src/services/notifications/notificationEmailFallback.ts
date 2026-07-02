import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../../db/index";
import { notificationsTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger/index";
import { generateUnsubscribeToken } from "../../shared/unsubscribeToken";
import { sendNotificationEmail } from "./email.service";

const logger = getLogger("notification-fallback");

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function sendNotificationEmailFallbacks(defaultInactiveDays = 3): Promise<number> {
  const db = getDb();
  let sent = 0;

  try {
    // Find users who haven't logged in recently
    const cutoff = daysAgo(defaultInactiveDays);
    const inactiveUsers = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        lastLoginAt: usersTable.lastLoginAt,
        metadata: usersTable.metadata,
      })
      .from(usersTable)
      .where(and(eq(usersTable.status, "active"), lt(usersTable.lastLoginAt, cutoff)));

    for (const user of inactiveUsers) {
      const meta = (user.metadata as Record<string, unknown>) ?? {};
      const prefs = (meta.notificationPreferences as Record<string, unknown>) ?? {};

      // Respect user's email fallback preference (default: true)
      const emailFallback = prefs.emailFallback !== false;
      if (!emailFallback) continue;

      const userInactiveDays =
        typeof prefs.emailFallbackDays === "number" ? prefs.emailFallbackDays : defaultInactiveDays;

      if (user.lastLoginAt && user.lastLoginAt > daysAgo(userInactiveDays)) continue;

      // Check for unread notifications
      const unread = await db
        .select()
        .from(notificationsTable)
        .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));

      if (unread.length === 0) continue;

      // Send summary email
      const count = unread.length;
      const latest = unread[0];
      const apiUrl = process.env.API_URL ?? process.env.APP_URL ?? "http://localhost:3000";
      const unsubToken = generateUnsubscribeToken(user.id, "notification");
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title: `You have ${count} unread notification${count > 1 ? "s" : ""}`,
        body:
          count === 1
            ? latest.title
            : `Most recent: ${latest.title}. Log in to view all ${count} notifications.`,
        link: process.env.APP_URL ? `${process.env.APP_URL}/dashboard` : undefined,
        unsubscribeUrl: `${apiUrl}/auth/unsubscribe?token=${unsubToken}`,
      });

      sent++;
      logger.info("Notification fallback email sent", { userId: user.id, unread: count });
    }
  } catch (err) {
    logger.error("Notification email fallback run failed", err as Error);
  }

  logger.info("Notification email fallback run complete", { sent });
  return sent;
}

let _fallbackInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationEmailFallbackScheduler(intervalHours = 24): void {
  if (_fallbackInterval) return;
  const ms = intervalHours * 60 * 60 * 1000;
  _fallbackInterval = setInterval(() => {
    sendNotificationEmailFallbacks().catch((err: Error) =>
      logger.error("Notification fallback scheduler error", err)
    );
  }, ms);
  _fallbackInterval.unref();
  logger.info("Notification email fallback scheduler started", { intervalHours });
}

export function stopNotificationEmailFallbackScheduler(): void {
  if (_fallbackInterval) {
    clearInterval(_fallbackInterval);
    _fallbackInterval = null;
  }
}
