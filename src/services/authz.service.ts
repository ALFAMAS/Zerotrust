import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db";
import { rolesTable, jitAccessTable } from "../db/schema";
import type { Permission, ABACCondition, User, AuthzContext, AuthzResult } from "../shared/types";

export class AuthorizationEngine {
  async evaluate(ctx: AuthzContext): Promise<AuthzResult> {
    const { user, resource, action } = ctx;
    const now = ctx.environment?.currentTime ?? new Date();

    const scheduleCheck = this.checkSchedule(user, now);
    if (scheduleCheck.decision === "deny") return scheduleCheck;

    const geoCheck = this.checkGeoRestriction(user, ctx.environment);
    if (geoCheck.decision === "deny") return geoCheck;

    const effectiveRoles = await this.resolveEffectiveRoles(user);

    for (const roleName of effectiveRoles) {
      const db = getDb();
      const rows = await db.select().from(rolesTable).where(eq(rolesTable.name, roleName)).limit(1);
      const role = rows[0];
      if (!role) continue;

      const allPermissions = await this.collectPermissionsFromHierarchy(role.id);

      for (const perm of allPermissions) {
        if (!this.matchesResource(perm.resource, resource)) continue;
        if (!perm.actions.includes(action) && !perm.actions.includes("*")) continue;

        const condResult = this.evaluateConditions(perm.conditions ?? [], ctx);
        if (condResult) return { decision: "allow", riskScore: 0 };
      }
    }

    return { decision: "deny", riskScore: 0, reason: "No matching permission found" };
  }

  private async resolveEffectiveRoles(user: User): Promise<string[]> {
    const roles = [...user.roles];

    try {
      const db = getDb();
      const now = new Date();
      const jitGrants = await db.select().from(jitAccessTable).where(
        and(
          eq(jitAccessTable.userId, user.id),
          eq(jitAccessTable.status, "approved"),
          gt(jitAccessTable.expiresAt, now)
        )
      );

      for (const jit of jitGrants) {
        const roleRows = await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.id, jit.roleId)).limit(1);
        const roleName = roleRows[0]?.name;
        if (roleName && !roles.includes(roleName)) roles.push(roleName);
      }
    } catch {
      // DB may not be initialized in tests
    }

    return roles;
  }

  private async collectPermissionsFromHierarchy(roleId: string): Promise<Permission[]> {
    const visited = new Set<string>();
    const permissions: Permission[] = [];

    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const db = getDb();
      const rows = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
      const role = rows[0];
      if (!role) return;

      permissions.push(...((role.permissions as Permission[]) ?? []));

      if (role.parentRoleId) await traverse(role.parentRoleId);
    };

    await traverse(roleId);
    return permissions;
  }

  private evaluateConditions(conditions: ABACCondition[], ctx: AuthzContext): boolean {
    if (!conditions || conditions.length === 0) return true;
    for (const cond of conditions) {
      const value = this.resolveAttribute(cond.attribute, ctx);
      if (!this.checkCondition(value, cond.operator, cond.value)) return false;
    }
    return true;
  }

  private resolveAttribute(path: string, ctx: AuthzContext): unknown {
    const parts = path.split(".");
    const root = parts[0];
    const rest = parts.slice(1);
    let obj: Record<string, unknown>;
    switch (root) {
      case "user": obj = ctx.user as unknown as Record<string, unknown>; break;
      case "env": obj = (ctx.environment as Record<string, unknown>) ?? {}; break;
      case "resource": obj = ctx.resourceAttributes ?? {}; break;
      default: return undefined;
    }
    return rest.reduce<unknown>((cur, key) => {
      if (cur && typeof cur === "object") return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private checkCondition(
    actual: unknown,
    op: ABACCondition["operator"],
    expected: unknown
  ): boolean {
    switch (op) {
      case "eq":
        return actual === expected;
      case "ne":
        return actual !== expected;
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
      case "nin":
        return Array.isArray(expected) && !expected.includes(actual);
      case "gt":
        return typeof actual === "number" && typeof expected === "number" && actual > expected;
      case "lt":
        return typeof actual === "number" && typeof expected === "number" && actual < expected;
      case "gte":
        return typeof actual === "number" && typeof expected === "number" && actual >= expected;
      case "lte":
        return typeof actual === "number" && typeof expected === "number" && actual <= expected;
      case "contains":
        if (Array.isArray(actual)) return actual.includes(expected);
        if (typeof actual === "string") return actual.includes(String(expected));
        return false;
      default:
        return false;
    }
  }

  private matchesResource(pattern: string, resource: string): boolean {
    if (pattern === "*") return true;
    if (pattern === resource) return true;
    if (pattern.endsWith(":*")) return resource.startsWith(pattern.slice(0, -2));
    return false;
  }

  private checkSchedule(user: User, now: Date): AuthzResult {
    const sched = user.sessionConfig?.scheduleRestriction;
    if (!sched?.enabled) return { decision: "allow", riskScore: 0 };

    const localTime = new Date(now.toLocaleString("en-US", { timeZone: sched.timezone }));
    const day = localTime.getDay();
    const hour = localTime.getHours();
    if (sched.allowedDays.length > 0 && !sched.allowedDays.includes(day)) {
      return { decision: "deny", riskScore: 0, reason: "ACCESS_SCHEDULE_BLOCKED" };
    }
    if (hour < sched.allowedHoursStart || hour >= sched.allowedHoursEnd) {
      return { decision: "deny", riskScore: 0, reason: "ACCESS_SCHEDULE_BLOCKED" };
    }
    return { decision: "allow", riskScore: 0 };
  }

  private checkGeoRestriction(user: User, env?: AuthzContext["environment"]): AuthzResult {
    const config = user.sessionConfig;
    if (!config) return { decision: "allow", riskScore: 0 };
    if (config.allowedCountries?.length > 0 && env?.currentCountry) {
      if (!config.allowedCountries.includes(env.currentCountry as string)) {
        return { decision: "deny", riskScore: 0, reason: "ACCESS_GEOFENCE_BLOCKED" };
      }
    }
    return { decision: "allow", riskScore: 0 };
  }
}
