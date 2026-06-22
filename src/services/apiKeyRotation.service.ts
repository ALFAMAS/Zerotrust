import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { apiKeysTable, usersTable } from "../db/schema";
import { sendNotificationEmail } from "./email.service";
import { getLogger } from "../logger";

const logger = getLogger("api-key-rotation");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const ROTATION_WARNING_DAYS = 7; // Warn 7 days before expiry
const DEFAULT_KEY_MAX_AGE_DAYS = 90; // Default max age if not explicitly set

/**
 * Check for API keys approaching expiry and send rotation reminders.
 * Should be called daily by a cron job.
 */
export async function checkApiKeyRotation(): Promise<{ warned: number; expired: number }> {
  const db = getDb();
  const now = new Date();
  const results = { warned: 0, expired: 0 };

  // Find keys with explicit expiry dates approaching
  const warningThreshold = new Date(now.getTime() + ROTATION_WARNING_DAYS * 86_400_000);
  const expiringKeys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      userId: apiKeysTable.userId,
      expiresAt: apiKeysTable.expiresAt,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(apiKeysTable)
    .innerJoin(usersTable, eq(usersTable.id, apiKeysTable.userId))
    .where(
      and(
        isNull(apiKeysTable.revokedAt),
        lte(apiKeysTable.expiresAt, warningThreshold),
        gte(apiKeysTable.expiresAt, now)
      )
    );

  for (const key of expiringKeys) {
    try {
      const daysLeft = Math.ceil((new Date(key.expiresAt!).getTime() - now.getTime()) / 86_400_000);
      await sendNotificationEmail(key.email, {
        name: key.displayName ?? key.email,
        title: `API key "${key.name}" expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        body: `Your API key "${key.name}" will expire on ${new Date(key.expiresAt!).toLocaleDateString()}. Rotate it now to avoid service interruption.\n\nGo to Settings → API Keys to rotate or update the expiry date.`,
        link: `${APP_URL}/dashboard/api-keys`,
      });
      results.warned++;
    } catch (err) {
      logger.warn("Failed to send rotation warning", { keyId: key.id, error: String(err) });
    }
  }

  // Find keys that have exceeded the default max age (90 days) without explicit expiry
  const maxAgeThreshold = new Date(now.getTime() - DEFAULT_KEY_MAX_AGE_DAYS * 86_400_000);
  const agedKeys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      userId: apiKeysTable.userId,
      createdAt: apiKeysTable.createdAt,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(apiKeysTable)
    .innerJoin(usersTable, eq(usersTable.id, apiKeysTable.userId))
    .where(
      and(
        isNull(apiKeysTable.revokedAt),
        isNull(apiKeysTable.expiresAt),
        lte(apiKeysTable.createdAt, maxAgeThreshold)
      )
    );

  for (const key of agedKeys) {
    try {
      const daysOld = Math.floor((now.getTime() - new Date(key.createdAt).getTime()) / 86_400_000);
      await sendNotificationEmail(key.email, {
        name: key.displayName ?? key.email,
        title: `API key "${key.name}" is ${daysOld} days old — time to rotate`,
        body: `Your API key "${key.name}" was created ${daysOld} days ago. For security best practices, we recommend rotating API keys every ${DEFAULT_KEY_MAX_AGE_DAYS} days.\n\nGo to Settings → API Keys to rotate this key.`,
        link: `${APP_URL}/dashboard/api-keys`,
      });
      results.expired++;
    } catch (err) {
      logger.warn("Failed to send age warning", { keyId: key.id, error: String(err) });
    }
  }

  if (results.warned || results.expired) {
    logger.info("API key rotation check complete", results);
  }
  return results;
}
