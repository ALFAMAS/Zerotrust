"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgIdFromRequest = orgIdFromRequest;
exports.shouldBypassOrgRls = shouldBypassOrgRls;
exports.verifyOrgMembership = verifyOrgMembership;
exports.resolveAndSetActiveOrg = resolveAndSetActiveOrg;
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("./index");
const schema_1 = require("./schema");
const roles_1 = require("../shared/roles");
/** Resolve org id from `X-Org-Id` header or `orgId` query param. */
function orgIdFromRequest(c, allowQuery = false) {
    const header = c.req.header("x-org-id")?.trim();
    if (header)
        return header;
    if (allowQuery)
        return c.req.query("orgId")?.trim() || undefined;
    return undefined;
}
/** Whether the principal may bypass org-scoped RLS (platform admin / support agent views). */
function shouldBypassOrgRls(c, user) {
    if (c.req.query("all") === "true" && ((0, roles_1.isAdmin)(user) || (0, roles_1.hasAnyRole)(user, ["support"]))) {
        return true;
    }
    return false;
}
/** Verify org membership; platform admins always pass. */
async function verifyOrgMembership(orgId, userId, user) {
    if ((0, roles_1.isAdmin)(user))
        return true;
    const db = (0, index_1.getDb)();
    const [member] = await db
        .select({ id: schema_1.organizationMembersTable.id })
        .from(schema_1.organizationMembersTable)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.organizationMembersTable.orgId, orgId), (0, drizzle_orm_1.eq)(schema_1.organizationMembersTable.userId, userId)))
        .limit(1);
    return Boolean(member);
}
/**
 * Validate and store active org on the Hono context (from `authMiddleware`).
 * Postgres `app.org_id` is set later by `orgRlsMiddleware` inside a transaction.
 */
async function resolveAndSetActiveOrg(c, user, opts) {
    const orgId = orgIdFromRequest(c, opts?.allowQuery);
    if (!orgId)
        return;
    if (!(await verifyOrgMembership(orgId, user.id, user)))
        return;
    c.set("activeOrgId", orgId);
}
//# sourceMappingURL=resolveOrgContext.js.map