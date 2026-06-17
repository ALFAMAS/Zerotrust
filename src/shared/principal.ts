/**
 * Audit principal — who actually performed an action: a human user, or an AI
 * agent / workload acting on its own or on behalf of a user (delegation).
 *
 * Agent tokens (see workload.routes.ts) carry `principal_type: "agent"` +
 * `workload_id`. Delegated tokens (RFC 8693 token exchange / "act-as") carry an
 * `act_as` actor claim. This derives a normalized principal from those claims so
 * the audit log can record the full human-vs-agent + delegation chain.
 */
export interface AuditPrincipal {
  type: "human" | "agent";
  id: string;
  workloadId?: string;
  /** When the principal acts on behalf of another subject, the delegation chain. */
  actAs?: string[];
}

type TokenLike = {
  sub?: string;
  principal_type?: string;
  workload_id?: string;
  act_as?: string | string[];
  actor?: { sub?: string } | string;
} & Record<string, unknown>;

function normalizeActAs(token: TokenLike): string[] | undefined {
  const raw = token.act_as ?? token.actor;
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") return [raw];
  if (typeof raw === "object" && typeof raw.sub === "string") return [raw.sub];
  return undefined;
}

/** Derive an {@link AuditPrincipal} from a verified token payload. */
export function principalFromToken(token: TokenLike | undefined | null): AuditPrincipal {
  if (!token) return { type: "human", id: "unknown" };
  const isAgent = token.principal_type === "agent" || typeof token.workload_id === "string";
  return {
    type: isAgent ? "agent" : "human",
    id: token.sub ?? "unknown",
    workloadId: typeof token.workload_id === "string" ? token.workload_id : undefined,
    actAs: normalizeActAs(token),
  };
}

/** Flatten a principal to audit-entry fields. */
export function principalAuditFields(p: AuditPrincipal): Record<string, unknown> {
  return {
    principal_type: p.type,
    ...(p.workloadId ? { workload_id: p.workloadId } : {}),
    ...(p.actAs && p.actAs.length > 0 ? { act_as: p.actAs } : {}),
  };
}

/** Human-readable one-liner, e.g. "agent workload:billing-bot on behalf of user-123". */
export function describePrincipal(p: AuditPrincipal): string {
  const base = p.type === "agent" ? `agent ${p.workloadId ?? p.id}` : `user ${p.id}`;
  return p.actAs && p.actAs.length > 0 ? `${base} on behalf of ${p.actAs.join(" → ")}` : base;
}
