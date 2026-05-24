import mongoose, { Schema, Document } from "mongoose";

export interface SaaSSettings {
  // Auth methods
  emailPasswordEnabled: boolean;
  googleOAuthEnabled: boolean;
  githubOAuthEnabled: boolean;
  magicLinkEnabled: boolean;
  passkeyEnabled: boolean;

  // MFA
  totpEnabled: boolean;
  emailOtpEnabled: boolean;
  smsOtpEnabled: boolean;

  // Security
  requireMfaForAll: boolean;
  sessionTTLSeconds: number;
  maxConcurrentSessions: number;
  accountLockoutEnabled: boolean;
  accountLockoutThreshold: number;
  accountLockoutDurationMinutes: number;

  // Registration
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  allowedEmailDomains: string[];

  // Branding
  appName: string;
  appUrl: string;
  supportEmail: string;
  logoUrl: string;

  updatedAt: Date;
  updatedBy?: string;
}

const SINGLETON_ID = "saas-settings";

type SettingsDocument = SaaSSettings & Document;

const SettingsSchema = new Schema<SettingsDocument>(
  {
    _id: { type: String, default: SINGLETON_ID },

    // Auth methods
    emailPasswordEnabled: { type: Boolean, default: true },
    googleOAuthEnabled: { type: Boolean, default: false },
    githubOAuthEnabled: { type: Boolean, default: false },
    magicLinkEnabled: { type: Boolean, default: true },
    passkeyEnabled: { type: Boolean, default: true },

    // MFA
    totpEnabled: { type: Boolean, default: true },
    emailOtpEnabled: { type: Boolean, default: true },
    smsOtpEnabled: { type: Boolean, default: false },

    // Security
    requireMfaForAll: { type: Boolean, default: false },
    sessionTTLSeconds: { type: Number, default: 3600 },
    maxConcurrentSessions: { type: Number, default: 5 },
    accountLockoutEnabled: { type: Boolean, default: true },
    accountLockoutThreshold: { type: Number, default: 5 },
    accountLockoutDurationMinutes: { type: Number, default: 30 },

    // Registration
    registrationEnabled: { type: Boolean, default: true },
    requireEmailVerification: { type: Boolean, default: false },
    allowedEmailDomains: { type: [String], default: [] },

    // Branding
    appName: { type: String, default: "My SaaS App" },
    appUrl: { type: String, default: "http://localhost:3002" },
    supportEmail: { type: String, default: "" },
    logoUrl: { type: String, default: "" },

    updatedBy: { type: String },
  },
  {
    timestamps: true,
    _id: false,
  }
);

export const SettingsModel = mongoose.model<SettingsDocument>("SaaSSettings", SettingsSchema);

/**
 * Returns the singleton settings document, creating it with defaults if it doesn't exist.
 */
export async function getSettings(): Promise<SaaSSettings> {
  let doc = await SettingsModel.findById(SINGLETON_ID);
  if (!doc) {
    doc = await SettingsModel.create({ _id: SINGLETON_ID });
  }
  return doc.toObject() as unknown as SaaSSettings;
}

/**
 * Partially updates the singleton settings document.
 */
export async function updateSettings(
  partial: Partial<SaaSSettings>,
  updatedBy?: string
): Promise<SaaSSettings> {
  const update: any = { ...partial, updatedAt: new Date() };
  if (updatedBy) update.updatedBy = updatedBy;

  const doc = await SettingsModel.findByIdAndUpdate(
    SINGLETON_ID,
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc!.toObject() as unknown as SaaSSettings;
}
