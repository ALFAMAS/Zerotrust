import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { achievementsTable } from "../db/schema";
import { isUnavailableStorageError } from "../db/storageFallback";
import { getLogger } from "../logger";

const logger = getLogger("achievement-service");

export const ACHIEVEMENT_DEFS = {
  first_login: {
    key: "first_login" as const,
    label: "First Login",
    description: "Signed in for the first time",
    icon: "👋",
  },
  power_user: {
    key: "power_user" as const,
    label: "Power User",
    description: "Logged in for 7 consecutive days",
    icon: "⚡",
  },
  early_adopter: {
    key: "early_adopter" as const,
    label: "Early Adopter",
    description: "One of the first users on the platform",
    icon: "🚀",
  },
} as const;

export type AchievementKey = keyof typeof ACHIEVEMENT_DEFS;

/**
 * Unlock an achievement for a user (idempotent).
 * Returns true if newly unlocked, false if already had it.
 */
export async function unlockAchievement(userId: string, key: AchievementKey) {
  const db = getDb();

  const existing = await db
    .select()
    .from(achievementsTable)
    .where(and(eq(achievementsTable.userId, userId), eq(achievementsTable.key, key)))
    .limit(1);

  if (existing.length > 0) return false; // already unlocked

  await db.insert(achievementsTable).values({ userId, key });
  logger.info("Achievement unlocked", { userId, key });
  // Fire level-up event
  void (async () => {
    try {
      const { handleLevelUpEvent } = await import("./levelUp.service.js");
      const def = ACHIEVEMENT_DEFS[key];
      await handleLevelUpEvent(userId, {
        type: "achievement",
        key,
        label: def.label,
        icon: def.icon,
      });
    } catch (err) {
      logger.warn("Failed to fire achievement level-up event", { userId, key, error: String(err) });
    }
  })();
  return true;
}

/**
 * Get all achievements for a user.
 */
export async function getUserAchievements(userId: string) {
  const db = getDb();
  try {
    return await db
      .select()
      .from(achievementsTable)
      .where(eq(achievementsTable.userId, userId))
      .orderBy(achievementsTable.unlockedAt);
  } catch (err) {
    if (isUnavailableStorageError(err, ["achievements"], ["user_id", "key", "unlocked_at"])) {
      logger.warn("Achievement storage is unavailable; returning no unlocked achievements", {
        userId,
        error: String(err),
      });
      return [];
    }
    throw err;
  }
}
