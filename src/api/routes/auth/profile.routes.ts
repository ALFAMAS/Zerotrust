import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../../db";
import { apiKeysTable, organizationInvitesTable, organizationMembersTable, usersTable } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { sensitiveReverification } from "../../../middleware/continuousVerification";
import { rateLimit } from "../../../middleware/rateLimiting";
import { recordAndRespond } from "../../../services/auth/accountTakeover.service";
import { invalidateUserCache } from "../../../services/auth/userStateCache.service";
import { getClientIp } from "../../../shared/clientIp";
import { internalError } from "../../../shared/httpErrors";
import { SUPPORTED_LOCALES } from "../../../shared/locale";
import { verifyPassword } from "../../../shared/passwordHash";
import type { HonoEnv, OAuthProvider, Passkey, User } from "../../../shared/types";
import { logger, rehashPasswordIfLegacy } from "./_shared";

const router = new Hono<HonoEnv>();
// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get("/me", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const db = getDb();
    const [row] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        roles: usersTable.roles,
        status: usersTable.status,
        phone: usersTable.phone,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
        emailVerifiedAt: usersTable.emailVerifiedAt,
        metadata: usersTable.metadata,
        locale: usersTable.locale,
        version: usersTable.version,
        mfa: usersTable.mfa,
        passkeys: usersTable.passkeys,
        oauthProviders: usersTable.oauthProviders,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!row) return c.json({ error: "USER_NOT_FOUND" }, 404);

    // Sanitize sensitive auth material before returning to the client: never
    // expose the TOTP secret, backup-code hashes, or passkey public keys.
    const rawMfa = (row.mfa as User["mfa"] | null) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };
    const mfa = {
      totp: {
        enabled: rawMfa.totp?.enabled === true,
        verifiedAt: rawMfa.totp?.verifiedAt ?? null,
        backupCodesRemaining: Array.isArray(rawMfa.totp?.backupCodes)
          ? rawMfa.totp.backupCodes.length
          : 0,
      },
      webauthn: { enabled: rawMfa.webauthn?.enabled === true },
    };
    const passkeys = ((row.passkeys as Passkey[] | null) ?? []).map((pk) => ({
      credentialId: pk.credentialId,
      name: pk.name ?? "Passkey",
      deviceType: pk.deviceType,
      aaguid: pk.aaguid,
      backedUp: pk.backedUp,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt ?? null,
    }));
    const oauthProviders = ((row.oauthProviders as OAuthProvider[] | null) ?? []).map((p) => ({
      provider: p.provider,
      email: p.email,
      connectedAt: p.connectedAt,
    }));

    const { mfa: _m, passkeys: _p, oauthProviders: _o, ...rest } = row;

    const [orgMembership] = await db
      .select({ id: organizationMembersTable.id })
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.userId, user.id))
      .limit(1);

    const [apiKey] = await db
      .select({ id: apiKeysTable.id })
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.userId, user.id), isNull(apiKeysTable.revokedAt)))
      .limit(1);

    const [sentInvite] = await db
      .select({ id: organizationInvitesTable.id })
      .from(organizationInvitesTable)
      .where(eq(organizationInvitesTable.invitedBy, user.id))
      .limit(1);

    const mfaEnabled = mfa.totp.enabled || mfa.webauthn.enabled;

    return c.json({
      ...rest,
      emailVerified: row.emailVerifiedAt != null,
      activeOrgId: c.get("activeOrgId") ?? c.get("session")?.activeOrgId ?? null,
      mfa,
      passkeys,
      oauthProviders,
      onboarding: {
        hasOrg: Boolean(orgMembership),
        hasSentInvite: Boolean(sentInvite),
        hasMfa: mfaEnabled,
        hasApiKey: Boolean(apiKey),
      },
    });
  } catch (err) {
    return internalError(c, logger, "Get current user error", err);
  }
});

// ── PATCH /auth/me ────────────────────────────────────────────────────────────

const patchMeSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, hyphens, underscores only")
      .nullable()
      .optional(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .strict();

router.patch("/me", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const { version: expectedVersion, ...fields } = parsed.data;
    const db = getDb();

    if (fields.username !== undefined && fields.username !== user.username) {
      if (fields.username !== null) {
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.username, fields.username), ne(usersTable.id, user.id)))
          .limit(1);
        if (existing) {
          return c.json({ error: "USERNAME_TAKEN" }, 409);
        }
      }
    }

    const setPayload = { ...fields, updatedAt: new Date() };

    const returningFields = {
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      roles: usersTable.roles,
      status: usersTable.status,
      phone: usersTable.phone,
      locale: usersTable.locale,
      version: usersTable.version,
      updatedAt: usersTable.updatedAt,
    };

    if (expectedVersion !== undefined) {
      const [updated] = await db
        .update(usersTable)
        .set({ ...setPayload, version: sql`${usersTable.version} + 1` })
        .where(and(eq(usersTable.id, user.id), eq(usersTable.version, expectedVersion)))
        .returning(returningFields);
      if (!updated) {
        return c.json(
          {
            error: "VERSION_CONFLICT",
            message: "Profile was modified elsewhere; refresh and retry",
          },
          409
        );
      }
      await invalidateUserCache(user.id);
      return c.json(updated);
    }

    const [updated] = await db
      .update(usersTable)
      .set({ ...setPayload, version: sql`${usersTable.version} + 1` })
      .where(eq(usersTable.id, user.id))
      .returning(returningFields);
    if (!updated) return c.json({ error: "USER_NOT_FOUND" }, 404);
    await invalidateUserCache(user.id);
    return c.json(updated);
  } catch (err) {
    return internalError(c, logger, "Patch current user error", err);
  }
});

// ── POST /auth/me/onboarding-complete ──────────────────────────────────────────
// Fires an analytics/Slack event when the user finishes the setup checklist.
// Idempotent: repeated calls are no-ops (tracked via users.metadata).
router.post("/me/onboarding-complete", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const db = getDb();

    const [row] = await db
      .select({ metadata: usersTable.metadata })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    // Idempotent: already marked complete.
    const metadata = row?.metadata as { onboardingCompletedAt?: string } | null | undefined;
    if (metadata?.onboardingCompletedAt) {
      return c.json({ success: true, alreadyCompleted: true });
    }

    await db
      .update(usersTable)
      .set({
        metadata: {
          ...(row?.metadata ?? {}),
          onboardingCompletedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    // Fire notification (Slack / Teams / PagerDuty) — non-blocking.
    const { notificationDispatcher } = await import("../../../notifications/dispatcher.js");
    void notificationDispatcher.dispatch("onboarding.completed", {
      userId: user.id,
      email: user.email,
      displayName: user.displayName ?? user.email,
    });

    return c.json({ success: true });
  } catch (err) {
    logger.error("Onboarding complete error", err as Error);
    return c.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to mark onboarding complete",
      },
      500
    );
  }
});

// ── NPS survey ────────────────────────────────────────────────────────────────

// GET /auth/me/nps/should-prompt — check if user should see NPS survey
router.get("/me/nps/should-prompt", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { shouldPromptNps } = await import("../../../services/ops/nps.service.js");
    const should = await shouldPromptNps(user.id);
    return c.json({ shouldPrompt: should });
  } catch (err) {
    logger.error("NPS should-prompt error", err as Error);
    return c.json({ shouldPrompt: false });
  }
});

// POST /auth/me/nps — submit NPS feedback
router.post("/me/nps", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const { score, comment, context } = await c.req.json().catch(() => ({}));
    if (typeof score !== "number" || score < 0 || score > 10) {
      return c.json({ error: "INVALID_REQUEST", message: "score must be 0-10" }, 400);
    }
    const { recordNpsFeedback } = await import("../../../services/ops/nps.service.js");
    await recordNpsFeedback(user.id, score, comment, context);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "NPS submit error", err);
  }
});

// ── POST /auth/me/email — change email (requires current password) ───────────

router.post(
  "/me/email",
  authMiddleware,
  sensitiveReverification,
  rateLimit({ points: 5, windowSecs: 60 }),
  async (c) => {
    try {
      const user = c.get("user");
      const { newEmail, password } = await c.req.json().catch(() => ({}));
      if (!newEmail || !password) {
        return c.json(
          {
            error: "INVALID_REQUEST",
            message: "newEmail and password required",
          },
          400
        );
      }

      const db = getDb();
      const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      if (!row?.passwordHash) {
        return c.json(
          {
            error: "REAUTH_REQUIRED",
            message: "Password verification required",
          },
          403
        );
      }

      const valid = await verifyPassword(password, row.passwordHash);
      if (!valid) {
        return c.json({ error: "INVALID_CREDENTIALS", message: "Incorrect password" }, 401);
      }
      await rehashPasswordIfLegacy(user.id, password, row.passwordHash);

      const normalized = String(newEmail).toLowerCase().trim();
      const [taken] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, normalized))
        .limit(1);
      if (taken) {
        return c.json({ error: "EMAIL_TAKEN", message: "Email already in use" }, 409);
      }

      const previousEmail = row.email;
      await db
        .update(usersTable)
        .set({ email: normalized, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await invalidateUserCache(user.id);

      // Account takeover detection: email change shortly after a password
      // reset (or other sensitive change) revokes other sessions and alerts
      // both the old and new address.
      void recordAndRespond(user.id, "email_change", {
        email: normalized,
        previousEmail,
        displayName: row.displayName ?? normalized,
        ipAddress: getClientIp(c),
        userAgent: c.req.header("user-agent"),
      });

      return c.json({ success: true, email: normalized });
    } catch (err) {
      return internalError(c, logger, "Email change error", err);
    }
  }
);

export default router;
