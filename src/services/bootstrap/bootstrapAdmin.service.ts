import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { RegisterSchema } from "../../api/schemas/auth.schema";
import { getDb } from "../../db";
import { createOrganizationWithOwner } from "../../db/repositories/orgs.repository";
import { organizationMembersTable, usersTable } from "../../db/schema";
import { hashPassword } from "../../shared/passwordHash";
import { hasRole, isAdmin } from "../../shared/roles";
import { rejectIfBreached } from "../auth/passwordBreach.service";

export type BootstrapAdminInput = {
  email: string;
  password: string;
  displayName?: string;
  orgName?: string;
  orgSlug?: string;
};

export type BootstrapAdminResult =
  | { ok: true; status: "created"; userId: string; orgId: string; email: string }
  | { ok: true; status: "promoted"; userId: string; orgId: string; email: string }
  | { ok: true; status: "already_exists"; userId: string; email: string }
  | { ok: false; reason: "admin_exists"; existingAdminEmail: string }
  | { ok: false; reason: "validation_error"; message: string };

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `org-${randomBytes(4).toString("hex")}`;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function defaultDisplayName(email: string, displayName?: string): string {
  return displayName?.trim() || email.split("@")[0] || "Admin";
}

async function findAnyAdmin(): Promise<{ id: string; email: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: usersTable.id, email: usersTable.email, roles: usersTable.roles })
    .from(usersTable)
    .where(sql`'admin' = ANY(${usersTable.roles})`)
    .limit(1);
  if (!row || !isAdmin(row)) return null;
  return { id: row.id, email: row.email };
}

async function userHasOrgMembership(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ orgId: organizationMembersTable.orgId })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.userId, userId))
    .limit(1);
  return Boolean(row);
}

async function ensureDefaultOrg(
  userId: string,
  orgName: string,
  orgSlug?: string
): Promise<string> {
  if (await userHasOrgMembership(userId)) {
    const db = getDb();
    const [row] = await db
      .select({ orgId: organizationMembersTable.orgId })
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.userId, userId))
      .limit(1);
    return row!.orgId;
  }

  const org = await createOrganizationWithOwner({
    name: orgName,
    slug: slugify(orgSlug ?? orgName),
    ownerId: userId,
  });
  return org.id;
}

async function grantAdminRole(userId: string, currentRoles: string[] | null | undefined) {
  if (hasRole({ roles: currentRoles ?? undefined }, "admin")) return;

  const roles = Array.isArray(currentRoles) ? [...currentRoles] : ["user"];
  if (!roles.includes("user")) roles.unshift("user");
  const updatedRoles = [...roles, "admin"];

  const db = getDb();
  await db
    .update(usersTable)
    .set({
      roles: updatedRoles,
      emailVerifiedAt: sql`COALESCE(${usersTable.emailVerifiedAt}, now())`,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
}

/**
 * One-shot bootstrap for the first platform admin + default org.
 * Idempotent when the requested email already holds the admin role.
 */
export async function bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const orgName = input.orgName?.trim() || "My Organization";

  const parsed = RegisterSchema.safeParse({
    email: normalizedEmail,
    password: input.password,
    displayName: input.displayName,
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid bootstrap input",
    };
  }

  const breachMessage = await rejectIfBreached(input.password);
  if (breachMessage) {
    return { ok: false, reason: "validation_error", message: breachMessage };
  }

  const existingAdmin = await findAnyAdmin();
  if (existingAdmin) {
    if (existingAdmin.email === normalizedEmail) {
      return {
        ok: true,
        status: "already_exists",
        userId: existingAdmin.id,
        email: existingAdmin.email,
      };
    }
    return {
      ok: false,
      reason: "admin_exists",
      existingAdminEmail: existingAdmin.email,
    };
  }

  const db = getDb();
  const [existingUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      roles: usersTable.roles,
      emailVerifiedAt: usersTable.emailVerifiedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    await grantAdminRole(existingUser.id, existingUser.roles);
    const orgId = await ensureDefaultOrg(existingUser.id, orgName, input.orgSlug);
    return {
      ok: true,
      status: "promoted",
      userId: existingUser.id,
      orgId,
      email: existingUser.email,
    };
  }

  const passwordHash = await hashPassword(input.password);
  const displayName = defaultDisplayName(normalizedEmail, input.displayName);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      passwordHash,
      displayName,
      roles: ["user", "admin"],
      attributes: {},
      mfa: {
        totp: { enabled: false, backupCodes: [] },
        webauthn: { enabled: false },
      },
      passkeys: [],
      oauthProviders: [],
      status: "active",
      emailVerifiedAt: new Date(),
      sessionConfig: {
        maxDevices: 5,
        allowedCountries: [],
        allowedIpRanges: [],
        scheduleRestriction: {
          enabled: false,
          timezone: "UTC",
          allowedDays: [],
          allowedHoursStart: 0,
          allowedHoursEnd: 23,
        },
      },
    })
    .returning({ id: usersTable.id, email: usersTable.email });

  if (!user) {
    throw new Error("Failed to create bootstrap admin user");
  }

  const orgId = await ensureDefaultOrg(user.id, orgName, input.orgSlug);
  return {
    ok: true,
    status: "created",
    userId: user.id,
    orgId,
    email: user.email,
  };
}
