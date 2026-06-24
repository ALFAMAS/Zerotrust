import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { notificationsTable, usersTable } from "../db/schema";
import { getLogger } from "../logger";
import { sendNotificationEmail } from "./email.service";

const logger = getLogger("level-up");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export type LevelUpEvent =
  | { type: "achievement"; key: string; label: string; icon: string }
  | { type: "streak_milestone"; days: number }
  | { type: "tier_change"; from: string; to: string }
  | { type: "points_milestone"; balance: number };

export async function handleLevelUpEvent(userId: string, event: LevelUpEvent): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({
      email: usersTable.email,
      displayName: usersTable.displayName,
      locale: usersTable.locale,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return;

  let title = "";
  let body = "";

  switch (event.type) {
    case "achievement":
      title = `Achievement Unlocked: ${event.label}!`;
      body = `Congratulations! You've unlocked the "${event.label}" achievement ${event.icon}. Keep up the great work!`;
      break;
    case "streak_milestone":
      title = `${event.days}-Day Login Streak!`;
      body = `Amazing! You've logged in for ${event.days} consecutive days. Keep the streak going!`;
      break;
    case "tier_change":
      title = `Upgraded to ${event.to}!`;
      body = `Your account has been upgraded from ${event.from} to ${event.to}. Enjoy your new features!`;
      break;
    case "points_milestone":
      title = `${event.balance} Points Earned!`;
      body = `You've reached ${event.balance} points! Check out the rewards page to see what you can redeem.`;
      break;
  }

  // Create in-app notification
  try {
    await db.insert(notificationsTable).values({
      userId,
      type: "success",
      title,
      body,
      link:
        event.type === "points_milestone" ? `${APP_URL}/dashboard/points` : `${APP_URL}/dashboard`,
    });
  } catch (err) {
    logger.warn("Failed to create in-app notification for level-up", {
      userId,
      error: String(err),
    });
  }

  // Send email for significant events
  if (event.type === "achievement" || event.type === "tier_change") {
    try {
      await sendNotificationEmail(user.email, {
        name: user.displayName ?? user.email,
        title,
        body,
        link: `${APP_URL}/dashboard`,
      });
    } catch (err) {
      logger.warn("Failed to send level-up email", { userId, error: String(err) });
    }
  }

  logger.info("Level-up event processed", { userId, eventType: event.type });
}
