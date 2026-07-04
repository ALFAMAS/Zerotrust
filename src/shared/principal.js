"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.principalFromToken = principalFromToken;
exports.principalAuditFields = principalAuditFields;
exports.describePrincipal = describePrincipal;
function normalizeActAs(token) {
    const raw = token.act_as ?? token.actor;
    if (!raw)
        return undefined;
    if (Array.isArray(raw))
        return raw.filter((x) => typeof x === "string");
    if (typeof raw === "string")
        return [raw];
    if (typeof raw === "object" && typeof raw.sub === "string")
        return [raw.sub];
    return undefined;
}
/** Derive an {@link AuditPrincipal} from a verified token payload. */
function principalFromToken(token) {
    if (!token)
        return { type: "human", id: "unknown" };
    const isAgent = token.principal_type === "agent" || typeof token.workload_id === "string";
    return {
        type: isAgent ? "agent" : "human",
        id: token.sub ?? "unknown",
        workloadId: typeof token.workload_id === "string" ? token.workload_id : undefined,
        actAs: normalizeActAs(token),
    };
}
/** Flatten a principal to audit-entry fields. */
function principalAuditFields(p) {
    return {
        principal_type: p.type,
        ...(p.workloadId ? { workload_id: p.workloadId } : {}),
        ...(p.actAs && p.actAs.length > 0 ? { act_as: p.actAs } : {}),
    };
}
/** Human-readable one-liner, e.g. "agent workload:billing-bot on behalf of user-123". */
function describePrincipal(p) {
    const base = p.type === "agent" ? `agent ${p.workloadId ?? p.id}` : `user ${p.id}`;
    return p.actAs && p.actAs.length > 0 ? `${base} on behalf of ${p.actAs.join(" → ")}` : base;
}
//# sourceMappingURL=principal.js.map