import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { streaksTable } from "../db/schema";
import { isUnavailableStorageError } from "../db/storageFallback";
import { getLogger } from "../logger";

const logger = getLogger("streak-service");

/** Number of hours after midnight a user can still count yesterday's login. */
const GRACE_PERIOD_HOURS = 24;

/**
 * Record a login event and update the user's streak.
 * Returns the updated streak info.
 *
 * Streak rules:
 * - A "login day" is the calendar date (UTC) of the login.
 * - If the user logged in yesterday (or within the grace period), increment.
 * - If the user logged in today already, no change.
 * - Otherwise, reset to 1.
 */
export async function recordLogin(userId: string) {
  const db = getDb();

  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const [streaks] = await db
    .select()
    .from(streaksTable)
    .where(eq(streaksTable.userId, userId))
    .limit(1);

  if (!streaks) {
    // First login ever — create streak record + First Login achievement check
    await db.insert(streaksTable).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastLoginDate: today,
      lastLoginAt: now,
    });
    logger.info("First login streak created", { userId });
    return { currentStreak: 1, longestStreak: 1, isNew: true };
  }

  // Already logged in today — no change
  if (streaks.lastLoginDate === today) {
    await db
      .update(streaksTable)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(streaksTable.userId, userId));
    return {
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      isNew: false,
    };
  }

  // Check if this login continues the streak (yesterday or within grace period)
  const lastLogin = streaks.lastLoginDate ? new Date(`${streaks.lastLoginDate}T00:00:00Z`) : null;
  const hoursSinceLastLogin = lastLogin
    ? (now.getTime() - lastLogin.getTime()) / 3_600_000
    : Infinity;

  const continuesStreak =
    streaks.lastLoginDate === yesterday || hoursSinceLastLogin <= GRACE_PERIOD_HOURS + 24;

  const newStreak = continuesStreak ? streaks.currentStreak + 1 : 1;
  const newLongest = Math.max(streaks.longestStreak, newStreak);

  await db
    .update(streaksTable)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastLoginDate: today,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(streaksTable.userId, userId));

  logger.info("Streak updated", { userId, currentStreak: newStreak, longestStreak: newLongest });

  // Fire level-up events for streak milestones
  const milestones = [3, 7, 14, 30, 60, 100, 365];
  if (milestones.includes(newStreak)) {
    void (async () => {
      try {
        const { handleLevelUpEvent } = await import("./levelUp.service.js");
        await handleLevelUpEvent(userId, { type: "streak_milestone", days: newStreak });
      } catch (err) {
        logger.warn("Failed to fire streak level-up event", { userId, error: String(err) });
      }
    })();
  }
  return { currentStreak: newStreak, longestStreak: newLongest, isNew: true };
}

/**
 * Get the current streak for a user.
 */
export async function getStreak(userId: string) {
  const db = getDb();
  try {
    const [streak] = await db
      .select()
      .from(streaksTable)
      .where(eq(streaksTable.userId, userId))
      .limit(1);

    return streak ?? { currentStreak: 0, longestStreak: 0, lastLoginDate: null };
  } catch (err) {
    if (
      isUnavailableStorageError(
        err,
        ["streaks"],
        ["current_streak", "longest_streak", "last_login_date", "last_login_at"]
      )
    ) {
      logger.warn("Streak storage is unavailable; returning empty streak", {
        userId,
        error: String(err),
      });
      return { currentStreak: 0, longestStreak: 0, lastLoginDate: null };
    }
    throw err;
  }
}
