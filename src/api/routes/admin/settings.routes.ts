import { Hono } from "hono";
import { z } from "zod";
import { auditLog } from "../../../logger";
import {
  getSettings,
  type SaaSSettings,
  SettingsVersionConflictError,
  updateSettings,
} from "../../../services/shared/saasSettings.service";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// GET /settings
router.get("/settings", async (c) => {
  try {
    const settings = await getSettings();
    return c.json(settings);
  } catch (err) {
    return internalError(c, logger, "Admin get settings error", err, "Failed to retrieve settings");
  }
});

// PUT /settings — every field is optional (partial update), but a field that
// IS present must fall within safe bounds. `.strict()` rejects unexpected
// keys outright rather than silently spreading them into the settings row.
const settingsUpdateSchema = z
  .object({
    emailPasswordEnabled: z.boolean(),
    googleOAuthEnabled: z.boolean(),
    githubOAuthEnabled: z.boolean(),
    appleOAuthEnabled: z.boolean(),
    magicLinkEnabled: z.boolean(),
    passkeyEnabled: z.boolean(),
    totpEnabled: z.boolean(),
    emailOtpEnabled: z.boolean(),
    smsOtpEnabled: z.boolean(),
    requireMfaForAll: z.boolean(),
    // 5 minutes .. 30 days
    sessionTTLSeconds: z
      .number()
      .int()
      .min(300)
      .max(30 * 24 * 60 * 60),
    maxConcurrentSessions: z.number().int().min(1).max(100),
    accountLockoutEnabled: z.boolean(),
    accountLockoutThreshold: z.number().int().min(1).max(50),
    // up to 24h
    accountLockoutDurationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    registrationEnabled: z.boolean(),
    requireEmailVerification: z.boolean(),
    // The model also accepts a comma-separated string and splits it —
    // preserved here so existing callers aren't broken.
    allowedEmailDomains: z.union([
      z.string().max(2000),
      z.array(z.string().trim().min(1).max(253)).max(100),
    ]),
    appName: z.string().trim().min(1).max(120),
    appUrl: z.string().url().max(2048),
    supportEmail: z.union([z.string().email(), z.literal("")]),
    logoUrl: z.union([z.string().url(), z.literal("")]),
    version: z.number().int().nonnegative().optional(),
  })
  .strict()
  .partial();

router.put("/settings", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message,
          issues: parsed.error.issues,
        },
        400
      );
    }

    const adminId = c.get("user").id;
    // Route owns the string→array normalization for allowedEmailDomains so
    // updateSettings() keeps an honest Partial<SaaSSettings> signature.
    const settingsUpdate: Partial<SaaSSettings> = {
      ...parsed.data,
      allowedEmailDomains:
        typeof parsed.data.allowedEmailDomains === "string"
          ? parsed.data.allowedEmailDomains
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : parsed.data.allowedEmailDomains,
    };
    const expectedVersion = parsed.data.version;
    delete (settingsUpdate as { version?: number }).version;
    const updated = await updateSettings(settingsUpdate, adminId, expectedVersion);
    // Platform-wide auth/security settings (MFA requirement, lockout
    // threshold, session TTL, registration) are a high-value target — every
    // change must land in the tamper-evident audit chain, not just app logs.
    await auditLog("admin.settings_updated", adminId, "saas_settings", true, {
      changes: parsed.data,
    });
    return c.json(updated);
  } catch (err) {
    if (err instanceof SettingsVersionConflictError) {
      return c.json(
        {
          error: "VERSION_CONFLICT",
          message: "Settings were modified by another admin; refresh and retry",
        },
        409
      );
    }
    return internalError(
      c,
      logger,
      "Admin update settings error",
      err,
      "Failed to update settings"
    );
  }
});

export default router;
