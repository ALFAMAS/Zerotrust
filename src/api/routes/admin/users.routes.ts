import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { sessionsTable, usersTable } from "../../../db/schema";
import { auditLog } from "../../../logger";
import { revokeAllSessionsForUser } from "../../../middleware/sessionControl";
import { invalidateUserCache } from "../../../services/auth/userStateCache.service";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated } from "../../../shared/pagination";
import { isAdmin } from "../../../shared/roles";
import type { HonoEnv, User } from "../../../shared/types";
import { logger, wouldOrphanAdmins } from "./_shared";

const router = new Hono<HonoEnv>();
// GET /users?page=1&limit=20&search=&status=
router.get("/users", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
    const search = c.req.query("search") || "";
    const status = c.req.query("status") || "";

    const db = getReadDb();
    const conditions = [ne(usersTable.status, "deleted")];

    if (search) {
      conditions.push(
        or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.displayName, `%${search}%`))!
      );
    }
    if (status) {
      conditions.push(eq(usersTable.status, status));
    }

    const where = and(...(conditions as [any, ...any[]]));

    const [users, total] = await Promise.all([
      db
        .select()
        .from(usersTable)
        .where(where)
        .orderBy(desc(usersTable.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      countRows(db, usersTable, where),
    ]);

    const sanitized = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      roles: u.roles,
      emailVerifiedAt: u.emailVerifiedAt,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));

    return c.json(paginated(sanitized, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin list users error", err, "Failed to list users");
  }
});

// GET /users/:id
router.get("/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getReadDb();
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const u = rows[0];
    const mfa = (u.mfa as User["mfa"] | null) ?? undefined;
    const passkeys = Array.isArray(u.passkeys) ? u.passkeys : [];
    const oauthProviders = Array.isArray(u.oauthProviders) ? u.oauthProviders : [];

    const activeSessions = await countRows(
      db,
      sessionsTable,
      and(eq(sessionsTable.userId, u.id), eq(sessionsTable.isActive, true))
    );

    return c.json({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      username: u.username,
      phone: u.phone,
      status: u.status,
      roles: u.roles,
      locale: u.locale,
      emailVerifiedAt: u.emailVerifiedAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      lastLoginAt: u.lastLoginAt,
      mfa: {
        totpEnabled: Boolean(mfa?.totp?.enabled),
        webauthnEnabled: Boolean(mfa?.webauthn?.enabled) || passkeys.length > 0,
      },
      passkeyCount: passkeys.length,
      oauthProviders: oauthProviders
        .map((p: any) => (typeof p === "string" ? p : p?.provider))
        .filter(Boolean),
      activeSessions,
    });
  } catch (err) {
    return internalError(c, logger, "Admin get user error", err, "Failed to retrieve user");
  }
});

// PATCH /users/:id
router.patch("/users/:id", async (c) => {
  try {
    const admin = c.get("user");
    const targetId = c.req.param("id");
    const body = await c.req.json();
    const allowed: Record<string, unknown> = {};

    if (body.displayName !== undefined) allowed.displayName = body.displayName;
    if (body.status !== undefined) {
      const validStatuses = ["active", "suspended", "pending", "deleted"];
      if (!validStatuses.includes(body.status)) {
        return c.json({ error: "INVALID_REQUEST", message: "Invalid status value" }, 400);
      }
      allowed.status = body.status;
    }

    if (Object.keys(allowed).length === 0) {
      return c.json({ error: "INVALID_REQUEST", message: "No updatable fields provided" }, 400);
    }

    const db = getDb();

    // H4: deactivating an admin (suspending/deleting/reverting to pending)
    // is destructive and hard to reverse. Block an admin from doing it to
    // themselves — accidental self-lockout even while other admins exist —
    // and block it outright when the target is the platform's last
    // remaining active admin.
    if (typeof allowed.status === "string" && allowed.status !== "active") {
      const [target] = await db
        .select({ id: usersTable.id, roles: usersTable.roles, status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (target && isAdmin(target) && target.status === "active") {
        if (target.id === admin.id) {
          return c.json(
            { error: "SELF_LOCKOUT", message: "You cannot change your own account status" },
            409
          );
        }
        if (await wouldOrphanAdmins(db, target.id)) {
          return c.json(
            { error: "LAST_ADMIN", message: "Cannot deactivate the last remaining active admin" },
            409
          );
        }
      }
    }

    allowed.updatedAt = new Date();
    const rows = await db
      .update(usersTable)
      .set(allowed)
      .where(eq(usersTable.id, targetId))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
      });

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }
    await invalidateUserCache(targetId);
    // A status change (suspend/reinstate/soft-delete via this generic path)
    // or display-name edit on someone else's account is a privileged action —
    // record it in the tamper-evident chain.
    await auditLog("admin.user_updated", admin.id, rows[0].id, true, { changes: allowed });
    return c.json(rows[0]);
  } catch (err) {
    return internalError(c, logger, "Admin update user error", err, "Failed to update user");
  }
});

// DELETE /users/:id
router.delete("/users/:id", async (c) => {
  try {
    const admin = c.get("user");
    const id = c.req.param("id");
    const db = getDb();

    // H4: same self-lockout / last-admin protections as the PATCH status path.
    const [target] = await db
      .select({ id: usersTable.id, roles: usersTable.roles, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (target && isAdmin(target) && target.status === "active") {
      if (target.id === admin.id) {
        return c.json(
          { error: "SELF_LOCKOUT", message: "You cannot delete your own account" },
          409
        );
      }
      if (await wouldOrphanAdmins(db, target.id)) {
        return c.json(
          { error: "LAST_ADMIN", message: "Cannot delete the last remaining active admin" },
          409
        );
      }
    }

    const rows = await db
      .update(usersTable)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    await invalidateUserCache(id);
    await revokeAllSessionsForUser(id);
    await auditLog("admin.user_deleted", admin.id, id, true);
    return c.json({ deleted: true, userId: id });
  } catch (err) {
    return internalError(c, logger, "Admin delete user error", err, "Failed to delete user");
  }
});

// POST /users/:id/force-logout
router.post("/users/:id/force-logout", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const userRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const count = await revokeAllSessionsForUser(id);
    return c.json({ success: true, revokedSessions: count });
  } catch (err) {
    return internalError(c, logger, "Admin force logout error", err, "Failed to force logout");
  }
});


export default router;
