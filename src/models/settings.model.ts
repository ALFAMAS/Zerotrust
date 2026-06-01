import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { saasSettingsTable } from "../db/schema";

export interface SaaSSettings {
  emailPasswordEnabled: boolean;
  googleOAuthEnabled: boolean;
  githubOAuthEnabled: boolean;
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
  updatedAt: Date;
  updatedBy?: string | null;
}

const SINGLETON_ID = "saas-settings";

export async function getSettings(): Promise<SaaSSettings> {
  const db = getDb();
  const rows = await db
    .select()
    .from(saasSettingsTable)
    .where(eq(saasSettingsTable.id, SINGLETON_ID))
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    return {
      emailPasswordEnabled: row.emailPasswordEnabled,
      googleOAuthEnabled: row.googleOAuthEnabled,
      githubOAuthEnabled: row.githubOAuthEnabled,
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
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
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
  updatedBy?: string
): Promise<SaaSSettings> {
  const db = getDb();
  const update: Record<string, unknown> = { ...partial, updatedAt: new Date() };
  if (updatedBy) update.updatedBy = updatedBy;

  await db
    .insert(saasSettingsTable)
    .values({ id: SINGLETON_ID, ...update })
    .onConflictDoUpdate({
      target: saasSettingsTable.id,
      set: { ...update },
    });

  return getSettings();
}
