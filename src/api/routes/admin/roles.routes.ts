import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { rolesTable, usersTable } from "../../../db/schema";
import { auditLog } from "../../../logger";
import { invalidateUserCache } from "../../../services/auth/userStateCache.service";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger, wouldOrphanAdmins } from "./_shared";

const router = new Hono<HonoEnv>();
// ── Roles ────────────────────────────────────────────────────────────────────

// GET /roles
router.get("/roles", async (c) => {
  try {
    const db = getReadDb();
    const roles = await db.select().from(rolesTable).orderBy(rolesTable.name);
    return c.json({ roles });
  } catch (err) {
    return internalError(c, logger, "Admin list roles error", err, "Failed to list roles");
  }
});

// POST /roles
router.post("/roles", async (c) => {
  try {
    const { name, displayName, description, parentRoleName, permissions } = await c.req.json();
    if (!name || !displayName) {
      return c.json(
        { error: "INVALID_REQUEST", message: "name and displayName are required" },
        400
      );
    }

    const db = getDb();
    const existing = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, name))
      .limit(1);
    if (existing.length > 0) {
      return c.json({ error: "ROLE_EXISTS", message: "Role already exists" }, 409);
    }

    let parentRoleId: string | undefined;
    if (parentRoleName) {
      const parentRows = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.name, parentRoleName))
        .limit(1);
      if (parentRows.length === 0) {
        return c.json({ error: "PARENT_ROLE_NOT_FOUND", message: "Parent role not found" }, 404);
      }
      parentRoleId = parentRows[0].id;
    }

    const [role] = await db
      .insert(rolesTable)
      .values({
        name,
        displayName,
        description,
        parentRoleId,
        permissions: permissions || [],
        isSystem: false,
      })
      .returning();

    return c.json({ role }, 201);
  } catch (err) {
    return internalError(c, logger, "Admin create role error", err, "Failed to create role");
  }
});

// POST /users/:id/roles — assign role to user
router.post("/users/:id/roles", async (c) => {
  try {
    const admin = c.get("user");
    const userId = c.req.param("id");
    const { roleName } = await c.req.json();
    if (!roleName) {
      return c.json({ error: "INVALID_REQUEST", message: "roleName is required" }, 400);
    }

    const db = getDb();
    const roleRows = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, roleName))
      .limit(1);
    if (roleRows.length === 0) {
      return c.json({ error: "ROLE_NOT_FOUND", message: "Role not found" }, 404);
    }

    const userRows = await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const currentRoles = (userRows[0].roles as string[]) || [];
    if (!currentRoles.includes(roleName)) {
      const updatedRoles = [...currentRoles, roleName];
      await db
        .update(usersTable)
        .set({ roles: updatedRoles, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      await invalidateUserCache(userId);
      // Privilege escalation is the single highest-value audit event this
      // router can emit — a grant must be traceable to who did it and when.
      await auditLog("admin.role_granted", admin.id, userId, true, { role: roleName });
      return c.json({ success: true, roles: updatedRoles });
    }

    return c.json({ success: true, roles: currentRoles });
  } catch (err) {
    return internalError(c, logger, "Admin assign role error", err, "Failed to assign role");
  }
});

// DELETE /users/:id/roles/:roleName — revoke role from user
router.delete("/users/:id/roles/:roleName", async (c) => {
  try {
    const admin = c.get("user");
    const userId = c.req.param("id");
    const roleName = c.req.param("roleName");

    const db = getDb();
    const userRows = await db
      .select({ id: usersTable.id, roles: usersTable.roles, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const target = userRows[0];
    const currentRoles = (target.roles as string[]) || [];

    // H4: revoking the admin role is exactly as destructive as deactivating
    // the account — same self-lockout / last-admin guards apply.
    if (roleName === "admin" && currentRoles.includes("admin") && target.status === "active") {
      if (target.id === admin.id) {
        return c.json(
          { error: "SELF_LOCKOUT", message: "You cannot revoke your own admin role" },
          409
        );
      }
      if (await wouldOrphanAdmins(db, target.id)) {
        return c.json(
          { error: "LAST_ADMIN", message: "Cannot revoke the last remaining active admin" },
          409
        );
      }
    }

    const updatedRoles = currentRoles.filter((r) => r !== roleName);
    await db
      .update(usersTable)
      .set({ roles: updatedRoles, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    await invalidateUserCache(userId);
    await auditLog("admin.role_revoked", admin.id, userId, true, { role: roleName });
    return c.json({ success: true, roles: updatedRoles });
  } catch (err) {
    return internalError(c, logger, "Admin revoke role error", err, "Failed to remove role");
  }
});


export default router;
