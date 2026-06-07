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
