"use strict";
/**
 * System-level role checks for the authenticated principal.
 *
 * These operate on the user's top-level `roles` array (e.g. `["admin", "user"]`)
 * set by `authMiddleware` — distinct from org-scoped permissions in
 * `permissions.ts`. Centralizing them keeps every check null-safe (a missing or
 * non-array `roles` always reads as "no role" / fails closed) instead of each
 * call site re-deriving `Array.isArray(...)` / `?.includes(...)` differently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRole = hasRole;
exports.hasAnyRole = hasAnyRole;
exports.isAdmin = isAdmin;
/** True when the bearer holds `role`. Fails closed for missing/non-array roles. */
function hasRole(bearer, role) {
    const roles = bearer?.roles;
    return Array.isArray(roles) && roles.includes(role);
}
/** True when the bearer holds at least one of `roles`. Fails closed. */
function hasAnyRole(bearer, roles) {
    const owned = bearer?.roles;
    if (!Array.isArray(owned))
        return false;
    return roles.some((r) => owned.includes(r));
}
/** Convenience for the most common check: does the bearer hold `admin`? */
function isAdmin(bearer) {
    return hasRole(bearer, "admin");
}
//# sourceMappingURL=roles.js.map