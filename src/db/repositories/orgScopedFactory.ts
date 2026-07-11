/**
 * SEC-12 — structural org scoping for repositories.
 *
 * Factories require a tenant id at construction time so org-scoped queries
 * cannot be invoked without an explicit org context.
 */

export type ScopedOrgId = string & { readonly __brand: unique symbol };

export function asScopedOrgId(orgId: string | undefined | null): ScopedOrgId {
  const trimmed = orgId?.trim();
  if (!trimmed) {
    throw new Error("ORG_ID_REQUIRED");
  }
  return trimmed as ScopedOrgId;
}

export interface OrgScopedContext {
  readonly orgId: ScopedOrgId;
}

/** Bind a validated org id for repository methods that must always scope by tenant. */
export function createOrgScopedContext(orgId: string): OrgScopedContext {
  return { orgId: asScopedOrgId(orgId) };
}

/**
 * Instantiate an org-scoped repository. The factory receives a validated org
 * context and must include org predicates on every query.
 */
export function createOrgScopedRepository<T>(
  orgId: string,
  factory: (ctx: OrgScopedContext) => T
): T {
  return factory(createOrgScopedContext(orgId));
}

/** Require org context at repository construction (throws ORG_ID_REQUIRED). */
export function requireOrgScopedContext(ctx: OrgScopedContext | undefined): OrgScopedContext {
  if (!ctx?.orgId) {
    throw new Error("ORG_ID_REQUIRED");
  }
  return ctx;
}
