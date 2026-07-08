import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { saasSettingsTable } from "../db/schema";

export interface SaaSSettings {
  emailPasswordEnabled: boolean;
  googleOAuthEnabled: boolean;
  githubOAuthEnabled: boolean;
  appleOAuthEnabled: boolean;
  magicLinkEnabled: boolean;
  passkeyEnabled: boolean;
  totpEnabled: boolean;
  emailOtpEnabled: boolean;
  smsOtpEnabled: boolean;
  requireMfaForAll: boolean;
  sessionTTLSeconds: number;
  maxConcurrentSessions: number;
  accountLockoutEnabled: boolean;
  accountLockoutThreshold: number;
  accountLockoutDurationMinutes: number;
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  allowedEmailDomains: string[];
  appName: string;
  appUrl: string;
  supportEmail: string;
  logoUrl: string;
  version: number;
  updatedAt: Date;
  updatedBy?: string | null;
}

/** Thrown when an optimistic-lock version check fails (HTTP 409). */
export class SettingsVersionConflictError extends Error {
  constructor() {
    super("VERSION_CONFLICT");
    this.name = "SettingsVersionConflictError";
  }
}

const SINGLETON_ID = "saas-settings";

function rowToSettings(row: typeof saasSettingsTable.$inferSelect): SaaSSettings {
  return {
    emailPasswordEnabled: row.emailPasswordEnabled,
    googleOAuthEnabled: row.googleOAuthEnabled,
    githubOAuthEnabled: row.githubOAuthEnabled,
    appleOAuthEnabled: row.appleOAuthEnabled,
    magicLinkEnabled: row.magicLinkEnabled,
    passkeyEnabled: row.passkeyEnabled,
    totpEnabled: row.totpEnabled,
    emailOtpEnabled: row.emailOtpEnabled,
    smsOtpEnabled: row.smsOtpEnabled,
    requireMfaForAll: row.requireMfaForAll,
    sessionTTLSeconds: row.sessionTTLSeconds,
    maxConcurrentSessions: row.maxConcurrentSessions,
    accountLockoutEnabled: row.accountLockoutEnabled,
    accountLockoutThreshold: row.accountLockoutThreshold,
    accountLockoutDurationMinutes: row.accountLockoutDurationMinutes,
    registrationEnabled: row.registrationEnabled,
    requireEmailVerification: row.requireEmailVerification,
    allowedEmailDomains: row.allowedEmailDomains ?? [],
    appName: row.appName,
    appUrl: row.appUrl,
    supportEmail: row.supportEmail,
    logoUrl: row.logoUrl,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getSettings(): Promise<SaaSSettings> {
  const db = getDb();
  const rows = await db
    .select()
    .from(saasSettingsTable)
    .where(eq(saasSettingsTable.id, SINGLETON_ID))
    .limit(1);

  if (rows.length > 0) {
    return rowToSettings(rows[0]);
  }

  // Create defaults if not found
  const [inserted] = await db
    .insert(saasSettingsTable)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return getSettings();
  }

  // Race condition — re-fetch
  return getSettings();
}

export async function updateSettings(
  partial: Partial<SaaSSettings>,
  updatedBy?: string,
  expectedVersion?: number
): Promise<SaaSSettings> {
  const db = getDb();
  const { version: _omitVersion, updatedAt: _omitUpdatedAt, ...fields } = partial;
  const update: Record<string, unknown> = { ...fields, updatedAt: new Date() };
  if (updatedBy) update.updatedBy = updatedBy;
  if (typeof update.allowedEmailDomains === "string") {
    update.allowedEmailDomains = (update.allowedEmailDomains as string)
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean);
  }

  if (expectedVersion !== undefined) {
    const [row] = await db
      .update(saasSettingsTable)
      .set({
        ...update,
        version: sql`${saasSettingsTable.version} + 1`,
      })
      .where(
        and(eq(saasSettingsTable.id, SINGLETON_ID), eq(saasSettingsTable.version, expectedVersion))
      )
      .returning();

    if (!row) {
      throw new SettingsVersionConflictError();
    }
    return rowToSettings(row);
  }

  await db
    .insert(saasSettingsTable)
    .values({ id: SINGLETON_ID, ...update })
    .onConflictDoUpdate({
      target: saasSettingsTable.id,
      set: {
        ...update,
        version: sql`${saasSettingsTable.version} + 1`,
      },
    });

  return getSettings();
}
