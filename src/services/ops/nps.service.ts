import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index";
import { feedbackTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("nps-service");

/**
 * Check if a user should be prompted for an NPS survey.
 * Returns true if the user has not been prompted in the last 90 days
 * and their account is at least 30 days old.
 */
export async function shouldPromptNps(userId: string): Promise<boolean> {
  const db = getDb();

  const [user] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return false;

  const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / 86_400_000;
  if (accountAgeDays < 30) return false;

  // Check for recent NPS feedback
  const [recent] = await db
    .select({ id: feedbackTable.id })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        eq(feedbackTable.type, "nps"),
        // Last 90 days
        gt(feedbackTable.createdAt, new Date(Date.now() - 90 * 86_400_000))
      )
    )
    .limit(1);

  return !recent;
}

/**
 * Record NPS feedback from a user.
 */
export async function recordNpsFeedback(
  userId: string,
  score: number,
  comment?: string,
  context?: string
) {
  const db = getDb();
  await db.insert(feedbackTable).values({
    userId,
    type: "nps",
    score,
    comment: comment ?? null,
    context: context ?? "automated_prompt",
  });
  logger.info("NPS feedback recorded", { userId, score });
}
