"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMagicLink = sendMagicLink;
exports.verifyMagicLink = verifyMagicLink;
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../../db/index");
const schema_1 = require("../../db/schema");
const index_2 = require("../../logger/index");
const settings_model_1 = require("../../models/settings.model");
const cryptoHash_1 = require("../../shared/cryptoHash");
const email_service_1 = require("../notifications/email.service");
const logger = (0, index_2.getLogger)("magic-link");
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
function hashToken(token) {
    return (0, cryptoHash_1.hashTokenSha256)(token);
}
async function sendMagicLink(email, redirectUrl) {
    try {
        const db = (0, index_1.getDb)();
        const userRows = await db
            .select({ id: schema_1.usersTable.id, displayName: schema_1.usersTable.displayName })
            .from(schema_1.usersTable)
            .where((0, drizzle_orm_1.eq)(schema_1.usersTable.email, email.toLowerCase()))
            .limit(1);
        if (userRows.length === 0) {
            logger.debug("Magic link requested for unknown email (silently ignored)", { email });
            return { sent: true };
        }
        const user = userRows[0];
        const rawToken = (0, node_crypto_1.randomBytes)(32).toString("hex");
        const tokenHash = hashToken(rawToken);
        await db.insert(schema_1.otpsTable).values({
            userId: user.id,
            code: tokenHash,
            type: "login",
            channel: "email",
            target: email,
            expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
        });
        const settings = await (0, settings_model_1.getSettings)();
        const appUrl = settings.appUrl || process.env.APP_URL || "http://localhost:3000";
        const magicLinkUrl = `${appUrl}/magic-link/verify` +
            `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}` +
            (redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : "");
        const name = user.displayName || email.split("@")[0];
        void (0, email_service_1.sendMagicLinkEmail)(email, { name, magicLinkUrl, expiresInMinutes: 15 });
        logger.info("Magic link email queued", { email });
    }
    catch (err) {
        logger.error("sendMagicLink error", err);
    }
    return { sent: true };
}
async function verifyMagicLink(email, token) {
    try {
        const tokenHash = hashToken(token);
        const db = (0, index_1.getDb)();
        const now = new Date();
        const records = await db
            .select()
            .from(schema_1.otpsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.otpsTable.target, email), (0, drizzle_orm_1.eq)(schema_1.otpsTable.channel, "email"), (0, drizzle_orm_1.eq)(schema_1.otpsTable.type, "login"), (0, drizzle_orm_1.eq)(schema_1.otpsTable.code, tokenHash), (0, drizzle_orm_1.gt)(schema_1.otpsTable.expiresAt, now)))
            .limit(1);
        if (records.length === 0) {
            logger.warn("Magic link verification failed — record not found or expired", { email });
            return null;
        }
        const record = records[0];
        await db.delete(schema_1.otpsTable).where((0, drizzle_orm_1.eq)(schema_1.otpsTable.id, record.id));
        const userRows = await db
            .select({ id: schema_1.usersTable.id, email: schema_1.usersTable.email })
            .from(schema_1.usersTable)
            .where((0, drizzle_orm_1.eq)(schema_1.usersTable.id, record.userId))
            .limit(1);
        if (userRows.length === 0) {
            logger.warn("Magic link user not found after record lookup", { userId: record.userId });
            return null;
        }
        return { userId: userRows[0].id, userEmail: userRows[0].email };
    }
    catch (err) {
        logger.error("verifyMagicLink error", err);
        return null;
    }
}
//# sourceMappingURL=magicLink.service.js.map