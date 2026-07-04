"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsVersionConflictError = void 0;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
/** Thrown when an optimistic-lock version check fails (HTTP 409). */
class SettingsVersionConflictError extends Error {
    constructor() {
        super("VERSION_CONFLICT");
        this.name = "SettingsVersionConflictError";
    }
}
exports.SettingsVersionConflictError = SettingsVersionConflictError;
const SINGLETON_ID = "saas-settings";
function rowToSettings(row) {
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
        version: row.version,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
    };
}
async function getSettings() {
    const db = (0, db_1.getDb)();
    const rows = await db
        .select()
        .from(schema_1.saasSettingsTable)
        .where((0, drizzle_orm_1.eq)(schema_1.saasSettingsTable.id, SINGLETON_ID))
        .limit(1);
    if (rows.length > 0) {
        return rowToSettings(rows[0]);
    }
    // Create defaults if not found
    const [inserted] = await db
        .insert(schema_1.saasSettingsTable)
        .values({ id: SINGLETON_ID })
        .onConflictDoNothing()
        .returning();
    if (inserted) {
        return getSettings();
    }
    // Race condition — re-fetch
    return getSettings();
}
async function updateSettings(partial, updatedBy, expectedVersion) {
    const db = (0, db_1.getDb)();
    const { version: _omitVersion, updatedAt: _omitUpdatedAt, ...fields } = partial;
    const update = { ...fields, updatedAt: new Date() };
    if (updatedBy)
        update.updatedBy = updatedBy;
    if (typeof update.allowedEmailDomains === "string") {
        update.allowedEmailDomains = update.allowedEmailDomains
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean);
    }
    if (expectedVersion !== undefined) {
        const [row] = await db
            .update(schema_1.saasSettingsTable)
            .set({
            ...update,
            version: (0, drizzle_orm_1.sql) `${schema_1.saasSettingsTable.version} + 1`,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.saasSettingsTable.id, SINGLETON_ID), (0, drizzle_orm_1.eq)(schema_1.saasSettingsTable.version, expectedVersion)))
            .returning();
        if (!row) {
            throw new SettingsVersionConflictError();
        }
        return rowToSettings(row);
    }
    await db
        .insert(schema_1.saasSettingsTable)
        .values({ id: SINGLETON_ID, ...update })
        .onConflictDoUpdate({
        target: schema_1.saasSettingsTable.id,
        set: {
            ...update,
            version: (0, drizzle_orm_1.sql) `${schema_1.saasSettingsTable.version} + 1`,
        },
    });
    return getSettings();
}
//# sourceMappingURL=settings.model.js.map