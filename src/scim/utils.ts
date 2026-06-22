import type { SCIMError, SCIMGroup, SCIMUser } from "./types";

/**
 * Convert a ZeroAuth UserDocument to SCIM 2.0 User representation.
 */
export function userToSCIM(user: any, baseUrl: string): SCIMUser {
  const id = String(user._id ?? user.id ?? "");
  const createdAt = user.createdAt ? new Date(user.createdAt).toISOString() : undefined;
  const updatedAt = user.updatedAt ? new Date(user.updatedAt).toISOString() : undefined;

  // Parse displayName into name parts (best-effort)
  const displayName: string = user.displayName ?? "";
  const nameParts = displayName.trim().split(/\s+/);
  const givenName = nameParts[0] ?? "";
  const familyName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const scimUser: SCIMUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id,
    userName: user.email ?? user.username ?? "",
    name: {
      formatted: displayName || undefined,
      givenName: givenName || undefined,
      familyName: familyName || undefined,
    },
    active: user.status === "active",
    meta: {
      resourceType: "User",
      created: createdAt,
      lastModified: updatedAt,
      location: `${baseUrl}/scim/v2/Users/${id}`,
    },
  };

  if (user.email) {
    scimUser.emails = [{ value: user.email, primary: true, type: "work" }];
  }

  if (user.phone) {
    scimUser.phoneNumbers = [{ value: user.phone, type: "work" }];
  }

  if (user.metadata?.scimExternalId) {
    scimUser.externalId = String(user.metadata.scimExternalId);
  }

  return scimUser;
}

/**
 * Convert a ZeroAuth role + its member users to a SCIM 2.0 Group representation.
 *
 * Groups map onto the `roles` table: the group's `displayName` is the role's
 * display name, and membership is derived from each user's `roles` array
 * (which holds role *names*).
 */
export function groupToSCIM(role: any, members: any[], baseUrl: string): SCIMGroup {
  const id = String(role.id ?? "");
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id,
    displayName: role.displayName ?? role.name ?? "",
    members: members.map((u) => ({
      value: String(u.id),
      display: u.displayName ?? u.email ?? undefined,
    })),
    meta: {
      resourceType: "Group",
      created: role.createdAt ? new Date(role.createdAt).toISOString() : undefined,
      lastModified: role.updatedAt ? new Date(role.updatedAt).toISOString() : undefined,
      location: `${baseUrl}/scim/v2/Groups/${id}`,
    },
  };
}

/**
 * Convert a SCIM User payload to ZeroAuth user field updates.
 */
export function scimToUserFields(scimUser: SCIMUser): Partial<{
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
  displayName: string;
}> {
  const fields: Record<string, unknown> = {};

  const primaryEmail =
    scimUser.emails?.find((e) => e.primary)?.value ?? scimUser.emails?.[0]?.value;
  if (primaryEmail) fields.email = primaryEmail;

  if (scimUser.name?.givenName) fields.firstName = scimUser.name.givenName;
  if (scimUser.name?.familyName) fields.lastName = scimUser.name.familyName;

  // Build displayName from name parts
  const parts = [scimUser.name?.givenName, scimUser.name?.familyName].filter(Boolean);
  if (parts.length) fields.displayName = parts.join(" ");
  else if (scimUser.name?.formatted) fields.displayName = scimUser.name.formatted;

  const primaryPhone =
    scimUser.phoneNumbers?.find((p) => p.type === "work")?.value ??
    scimUser.phoneNumbers?.[0]?.value;
  if (primaryPhone) fields.phone = primaryPhone;

  if (scimUser.active !== undefined) fields.active = scimUser.active;

  return fields as Partial<{
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    active: boolean;
    displayName: string;
  }>;
}

/**
 * Build a SCIM 2.0 Error object.
 */
export function scimError(status: number, detail: string, scimType?: string): SCIMError {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(status),
    ...(scimType && { scimType }),
    detail,
  };
}

/**
 * Parse a simple SCIM filter expression.
 * Supports: `attribute op "value"` or `attribute op value`
 * Examples: `userName eq "user@example.com"`, `externalId eq "abc123"`
 */
export function parseSCIMFilter(
  filter: string
): { attribute: string; operator: string; value: string } | null {
  if (!filter?.trim()) return null;

  // Match: attribute operator "value" or attribute operator value
  const match = filter.trim().match(/^(\S+)\s+(eq|ne|co|sw|ew|gt|lt|ge|le|pr)\s+"?([^"]*)"?$/i);
  if (!match) return null;

  return {
    attribute: match[1],
    operator: match[2].toLowerCase(),
    value: match[3],
  };
}
