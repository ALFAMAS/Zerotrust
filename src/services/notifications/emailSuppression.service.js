"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailSuppressed = isEmailSuppressed;
exports.suppressEmail = suppressEmail;
exports.unsuppressEmail = unsuppressEmail;
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../../db/index");
const schema_1 = require("../../db/schema");
const index_2 = require("../../logger/index");
const logger = (0, index_2.getLogger)("email-suppression");
/**
 * Is this address on the suppression list? Defensive: returns false on any error
 * so a lookup failure never silently drops a legitimate email (and so unit tests
 * that don't wire a DB behave as before).
 */
async function isEmailSuppressed(email) {
    if (!email)
        return false;
    try {
        const db = (0, index_1.getDb)();
        const [row] = await db
            .select({ email: schema_1.emailSuppressionsTable.email })
            .from(schema_1.emailSuppressionsTable)
            .where((0, drizzle_orm_1.eq)(schema_1.emailSuppressionsTable.email, email.toLowerCase()))
            .limit(1);
        return Boolean(row);
    }
    catch {
        return false;
    }
}
/** Add an address to the suppression list (idempotent upsert). */
async function suppressEmail(email, reason, detail) {
    const normalized = email.toLowerCase();
    const db = (0, index_1.getDb)();
    await db
        .insert(schema_1.emailSuppressionsTable)
        .values({ email: normalized, reason, detail: detail ?? null })
        .onConflictDoUpdate({
        target: schema_1.emailSuppressionsTable.email,
        set: { reason, detail: detail ?? null },
    });
    logger.info("Email suppressed", { email: normalized, reason });
}
/** Remove an address from the suppression list (e.g. user re-confirms). */
async function unsuppressEmail(email) {
    const db = (0, index_1.getDb)();
    // The `postgres` driver's delete-without-.returning() result exposes the
    // affected row count as `.count`, not `.rowCount` (see dataRetention.ts).
    const result = await db
        .delete(schema_1.emailSuppressionsTable)
        .where((0, drizzle_orm_1.eq)(schema_1.emailSuppressionsTable.email, email.toLowerCase()));
    return (result.count ?? 0) > 0;
}
//# sourceMappingURL=emailSuppression.service.js.map