import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptionsTable, usersTable } from "../db/schema";
import { getLogger } from "../logger";
import { sendNotificationEmail } from "./email.service";

const logger = getLogger("lifecycle-emails");

const APP_NAME = process.env.APP_NAME ?? "zerotrust";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Send automated lifecycle emails to users based on their account age.
 * Designed to be called by a cron job (e.g. daily).
 *
 * D1: Welcome tips (day 1)
 * D3: Feature tips (day 3)
 * D7: Check-in (day 7)
 * D14: Trial expiry warning (day 14, trial only)
 */
export async function sendLifecycleEmails() {
  const db = getDb();
  const now = new Date();
  const results: { day: number; sent: number }[] = [];

  // D1: Welcome tips — users who registered exactly 1 day ago
  const d1Start = new Date(now.getTime() - 1 * 86_400_000);
  d1Start.setHours(0, 0, 0, 0);
  const d1End = new Date(d1Start);
  d1End.setHours(23, 59, 59, 999);

  const d1Users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      locale: usersTable.locale,
    })
    .from(usersTable)
    .where(
      and(
        gte(usersTable.createdAt, d1Start),
        lte(usersTable.createdAt, d1End),
        // Only send if not already sent (tracked in metadata)
        sql`(${usersTable.metadata}->>'lifecycleD1Sent') IS NULL`
      )
    );

  let d1Sent = 0;
  for (const user of d1Users) {
    try {
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title: `Welcome to ${APP_NAME} — here's how to get started`,
        body: `Hi ${user.displayName ?? "there"}! 👋\n\nWelcome to ${APP_NAME}. Here are a few things you can do to get the most out of your account:\n\n• Complete your profile setup\n• Enable two-factor authentication for extra security\n• Invite your team members\n• Explore our API documentation\n\nNeed help? Reply to this email or use the in-app chat.`,
        link: `${APP_URL}/dashboard`,
      });
      // Mark as sent
      await db
        .update(usersTable)
        .set({
          metadata: {
            ...((user as any).metadata ?? {}),
            lifecycleD1Sent: new Date().toISOString(),
          },
        })
        .where(eq(usersTable.id, user.id));
      d1Sent++;
    } catch (err) {
      logger.warn("Failed to send D1 email", {
        userId: user.id,
        error: String(err),
      });
    }
  }
  results.push({ day: 1, sent: d1Sent });

  // D3: Feature tips — users who registered exactly 3 days ago
  const d3Start = new Date(now.getTime() - 3 * 86_400_000);
  d3Start.setHours(0, 0, 0, 0);
  const d3End = new Date(d3Start);
  d3End.setHours(23, 59, 59, 999);

  const d3Users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(
      and(
        gte(usersTable.createdAt, d3Start),
        lte(usersTable.createdAt, d3End),
        sql`(${usersTable.metadata}->>'lifecycleD3Sent') IS NULL`
      )
    );

  let d3Sent = 0;
  for (const user of d3Users) {
    try {
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title: `${APP_NAME} tips — are you making the most of your account?`,
        body: `Hi ${user.displayName ?? "there"}!\n\nIt's been a few days since you joined ${APP_NAME}. Here are some features you might have missed:\n\n• API Keys — generate keys for programmatic access\n• Webhooks — get real-time notifications for events\n• Custom Roles — fine-grained permissions for your team\n• Audit Logs — track all activity in your organization\n\nVisit your dashboard to explore these features.`,
        link: `${APP_URL}/dashboard`,
      });
      await db
        .update(usersTable)
        .set({
          metadata: {
            ...((user as any).metadata ?? {}),
            lifecycleD3Sent: new Date().toISOString(),
          },
        })
        .where(eq(usersTable.id, user.id));
      d3Sent++;
    } catch (err) {
      logger.warn("Failed to send D3 email", {
        userId: user.id,
        error: String(err),
      });
    }
  }
  results.push({ day: 3, sent: d3Sent });

  // D7: Check-in — users who registered exactly 7 days ago
  const d7Start = new Date(now.getTime() - 7 * 86_400_000);
  d7Start.setHours(0, 0, 0, 0);
  const d7End = new Date(d7Start);
  d7End.setHours(23, 59, 59, 999);

  const d7Users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(
      and(
        gte(usersTable.createdAt, d7Start),
        lte(usersTable.createdAt, d7End),
        sql`(${usersTable.metadata}->>'lifecycleD7Sent') IS NULL`
      )
    );

  let d7Sent = 0;
  for (const user of d7Users) {
    try {
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title: `How's ${APP_NAME} working for you?`,
        body: `Hi ${user.displayName ?? "there"}!\n\nYou've been using ${APP_NAME} for a week now. We'd love to hear how it's going!\n\n• Is everything working as expected?\n• Do you need help with any features?\n• Have you tried our API yet?\n\nReply to this email or use the in-app chat — we're here to help.`,
        link: `${APP_URL}/dashboard`,
      });
      await db
        .update(usersTable)
        .set({
          metadata: {
            ...((user as any).metadata ?? {}),
            lifecycleD7Sent: new Date().toISOString(),
          },
        })
        .where(eq(usersTable.id, user.id));
      d7Sent++;
    } catch (err) {
      logger.warn("Failed to send D7 email", {
        userId: user.id,
        error: String(err),
      });
    }
  }
  results.push({ day: 7, sent: d7Sent });

  // D14: Trial expiry — users on trial whose trial ends in ~14 days
  const d14Start = new Date(now.getTime() + 13 * 86_400_000);
  d14Start.setHours(0, 0, 0, 0);
  const d14End = new Date(now.getTime() + 15 * 86_400_000);
  d14End.setHours(23, 59, 59, 999);

  const d14Users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      trialEnd: subscriptionsTable.trialEnd,
    })
    .from(usersTable)
    .innerJoin(subscriptionsTable, eq(usersTable.id, subscriptionsTable.userId))
    .where(
      and(
        gte(subscriptionsTable.trialEnd, d14Start),
        lte(subscriptionsTable.trialEnd, d14End),
        sql`(${usersTable.metadata}->>'lifecycleD14Sent') IS NULL`
      )
    );

  let d14Sent = 0;
  for (const user of d14Users) {
    try {
      const trialEndDate = user.trialEnd ? new Date(user.trialEnd).toLocaleDateString() : "soon";
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title: `Your ${APP_NAME} trial expires on ${trialEndDate}`,
        body: `Hi ${user.displayName ?? "there"}!\n\nYour ${APP_NAME} trial expires on ${trialEndDate}. Don't lose your data and settings!\n\nUpgrade now to keep:\n• All your API keys and configurations\n• Team members and roles\n• Audit logs and webhook settings\n• Custom security policies\n\nUpgrade before your trial ends to avoid any interruption.`,
        link: `${APP_URL}/dashboard/billing`,
      });
      await db
        .update(usersTable)
        .set({
          metadata: {
            ...((user as any).metadata ?? {}),
            lifecycleD14Sent: new Date().toISOString(),
          },
        })
        .where(eq(usersTable.id, user.id));
      d14Sent++;
    } catch (err) {
      logger.warn("Failed to send D14 email", {
        userId: user.id,
        error: String(err),
      });
    }
  }
  results.push({ day: 14, sent: d14Sent });

  logger.info("Lifecycle emails sent", { results });
  return results;
}
