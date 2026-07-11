import type { usersTable } from "../db/schema";
import { SCIM_USER_SCHEMA, type ScimUserResource } from "./types";

type UserRow = typeof usersTable.$inferSelect;

export function toScimUser(
  user: Pick<
    UserRow,
    "id" | "email" | "displayName" | "status" | "createdAt" | "updatedAt"
  >,
  baseUrl?: string
): ScimUserResource {
  const active = user.status !== "deleted" && user.status !== "suspended";
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    userName: user.email,
    displayName: user.displayName,
    name: { formatted: user.displayName },
    active,
    emails: [{ value: user.email, primary: true }],
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      ...(baseUrl ? { location: `${baseUrl}/scim/v2/Users/${user.id}` } : {}),
    },
  };
}

export function parseScimUserName(body: Record<string, unknown>): string | null {
  if (typeof body.userName === "string" && body.userName.trim()) {
    return body.userName.trim().toLowerCase();
  }
  const emails = body.emails;
  if (Array.isArray(emails)) {
    const primary = emails.find(
      (e) => e && typeof e === "object" && (e as { primary?: boolean }).primary
    ) as { value?: string } | undefined;
    const first = (primary?.value ?? (emails[0] as { value?: string })?.value)?.trim();
    if (first) return first.toLowerCase();
  }
  return null;
}

export function parseScimActive(body: Record<string, unknown>): boolean | undefined {
  if (typeof body.active === "boolean") return body.active;
  return undefined;
}

export function parseScimDisplayName(body: Record<string, unknown>): string | undefined {
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    return body.displayName.trim();
  }
  const name = body.name;
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const formatted = (name as { formatted?: string }).formatted;
    if (formatted?.trim()) return formatted.trim();
  }
  return undefined;
}
