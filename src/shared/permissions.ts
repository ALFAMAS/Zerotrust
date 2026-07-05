/**
 * Org-scoped authorization — deny-by-default.
 *
 * New endpoints should call {@link assertCan} (or {@link authorizeOrg} when
 * membership must be loaded) instead of scattering inline role checks.
 * {@link hasOrgPermission} remains the low-level permission matrix helper.
 */

export const ORG_PERMISSIONS = [
  "members:read",
  "members:invite",
  "members:manage",
  "billing:view",
  "billing:manage",
  "settings:view",
  "settings:manage",
  "audit:view",
  "roles:manage",
  "invites:manage",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export const SYSTEM_ROLE_PERMISSIONS: Record<string, OrgPermission[]> = {
  owner: [
    "members:read",
    "members:invite",
    "members:manage",
    "billing:view",
    "billing:manage",
    "settings:view",
    "settings:manage",
    "audit:view",
    "roles:manage",
    "invites:manage",
  ],
  admin: [
    "members:read",
    "members:invite",
    "members:manage",
    "billing:view",
    "settings:view",
    "settings:manage",
    "audit:view",
    "invites:manage",
  ],
  member: ["members:read", "billing:view", "settings:view"],
  viewer: ["members:read"],
};

/** Canonical org actions — map to {@link OrgPermission} or owner/admin tiers. */
export type OrgAction =
  | "org:read"
  | "org:update"
  | "org:delete"
  | "org:transfer"
  | "members:read"
  | "members:remove"
  | "invites:read"
  | "invites:manage"
  | "security:read"
  | "security:manage";

export type AuthResource = { type: "org"; orgId: string };

export interface OrgMembershipContext {
  orgId: string;
  userId: string;
  role: string;
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN" as const;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const OWNER_ONLY_ACTIONS: ReadonlySet<OrgAction> = new Set(["org:delete", "org:transfer"]);

/** Admin-or-owner tier — member/viewer must not pass even when a read permission exists. */
const ADMIN_OR_OWNER_ACTIONS: ReadonlySet<OrgAction> = new Set([
  "org:update",
  "invites:read",
  "invites:manage",
  "security:read",
  "security:manage",
]);

const ACTION_TO_PERMISSION: Partial<Record<OrgAction, OrgPermission>> = {
  "org:read": "members:read",
  "members:read": "members:read",
  "org:update": "settings:manage",
  "security:manage": "settings:manage",
  "invites:read": "invites:manage",
  "invites:manage": "invites:manage",
};

export function hasOrgPermission(
  role: string,
  customPermissions: string[] | null,
  permission: OrgPermission
): boolean {
  if (role === "custom" && customPermissions) {
    return customPermissions.includes(permission);
  }
  return (SYSTEM_ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

function isAdminOrOwner(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Deny-by-default authorization choke point (SEC-5).
 *
 * @throws {@link AuthorizationError} when the principal may not perform the action.
 */
export function assertCan(
  principal: { id: string } | null | undefined,
  action: OrgAction,
  resource: AuthResource,
  context: {
    membership?: OrgMembershipContext | null;
    customPermissions?: string[] | null;
  } = {}
): asserts context is { membership: OrgMembershipContext } {
  if (!principal?.id) {
    throw new AuthorizationError("Authentication required");
  }

  const { membership, customPermissions = null } = context;

  if (!membership || membership.orgId !== resource.orgId || membership.userId !== principal.id) {
    throw new AuthorizationError("Not a member of this organization");
  }

  if (OWNER_ONLY_ACTIONS.has(action)) {
    if (membership.role !== "owner") {
      throw new AuthorizationError("Owner role required");
    }
    return;
  }

  // Route validates self-removal vs admin-removal before calling assertCan.
  if (action === "members:remove") {
    return;
  }

  if (ADMIN_OR_OWNER_ACTIONS.has(action) && !isAdminOrOwner(membership.role)) {
    throw new AuthorizationError("Admin role required");
  }

  const permission = ACTION_TO_PERMISSION[action];
  if (!permission) {
    throw new AuthorizationError("Unknown action");
  }

  if (!hasOrgPermission(membership.role, customPermissions, permission)) {
    throw new AuthorizationError("Insufficient permissions");
  }
}

/** Load membership then {@link assertCan}; returns membership on success. */
export async function authorizeOrg(
  principal: { id: string } | null | undefined,
  action: OrgAction,
  orgId: string,
  loadMembership: (orgId: string, userId: string) => Promise<OrgMembershipContext | null>,
  customPermissions?: string[] | null
): Promise<OrgMembershipContext> {
  const userId = principal?.id;
  if (!userId) {
    throw new AuthorizationError("Authentication required");
  }
  const membership = await loadMembership(orgId, userId);
  assertCan(principal, action, { type: "org", orgId }, { membership, customPermissions });
  return membership!;
}
