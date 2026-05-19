import type { Permission, ABACCondition, User, AuthzContext, AuthzResult } from "../shared/types";
import { RoleModel } from "../models/index";
import { JITModel } from "../models/index";

export class AuthorizationEngine {
  async evaluate(ctx: AuthzContext): Promise<AuthzResult> {
    const { user, resource, action } = ctx;
    const now = ctx.environment?.time ?? new Date();

    // 1. Check schedule restriction
    const scheduleCheck = this.checkSchedule(user, now);
    if (!scheduleCheck.allowed) return scheduleCheck;

    // 2. Check geo / IP restrictions
    const geoCheck = this.checkGeoRestriction(user, ctx.environment);
    if (!geoCheck.allowed) return geoCheck;

    // 3. Resolve effective roles (static + JIT)
    const effectiveRoles = await this.resolveEffectiveRoles(user);

    // 4. Check each role's permissions with ABAC conditions
    for (const roleName of effectiveRoles) {
      const role = await RoleModel.findOne({ name: roleName }).lean();
      if (!role) continue;

      // Traverse hierarchy
      const allPermissions = await this.collectPermissionsFromHierarchy(role._id.toString());

      for (const perm of allPermissions) {
        if (!this.matchesResource(perm.resource, resource)) continue;
        if (!perm.actions.includes(action) && !perm.actions.includes("*")) continue;

        // Evaluate ABAC conditions
        const condResult = this.evaluateConditions(perm.conditions ?? [], ctx);
        if (condResult) {
          return { allowed: true, matchedRole: roleName, matchedPermission: perm.resource };
        }
      }
    }

    return { allowed: false, reason: "No matching permission found" };
  }

  private async resolveEffectiveRoles(user: User): Promise<string[]> {
    const roles = [...user.roles];

    // Check active JIT grants
    const jitGrants = await JITModel.find({
      userId: user._id,
      status: "approved",
      expiresAt: { $gt: new Date() },
    }).populate("roleId").lean();

    for (const jit of jitGrants) {
      const role = jit.roleId as { name: string } | null;
      if (role?.name && !roles.includes(role.name)) {
        roles.push(role.name);
      }
    }

    return roles;
  }

  private async collectPermissionsFromHierarchy(roleId: string): Promise<Permission[]> {
    const visited = new Set<string>();
    const permissions: Permission[] = [];

    const traverse = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const role = await RoleModel.findById(id).lean();
      if (!role) return;

      permissions.push(...(role.permissions as Permission[]));

      if (role.parentRoleId) {
        await traverse(role.parentRoleId.toString());
      }
    };

    await traverse(roleId);
    return permissions;
  }

  private evaluateConditions(conditions: ABACCondition[], ctx: AuthzContext): boolean {
    if (!conditions || conditions.length === 0) return true;

    for (const cond of conditions) {
      const value = this.resolveAttribute(cond.attribute, ctx);
      if (!this.checkCondition(value, cond.operator, cond.value)) {
        return false;
      }
    }
    return true;
  }

  private resolveAttribute(path: string, ctx: AuthzContext): unknown {
    const parts = path.split(".");
    const root = parts[0];
    const rest = parts.slice(1);

    let obj: Record<string, unknown>;
    switch (root) {
      case "user":
        obj = ctx.user as unknown as Record<string, unknown>;
        break;
      case "env":
        obj = ctx.environment as Record<string, unknown> ?? {};
        break;
      case "resource":
        obj = ctx.resourceAttributes ?? {};
        break;
      default:
        return undefined;
    }

    return rest.reduce<unknown>((cur, key) => {
      if (cur && typeof cur === "object") {
        return (cur as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private checkCondition(actual: unknown, op: ABACCondition["operator"], expected: unknown): boolean {
    switch (op) {
      case "eq": return actual === expected;
      case "ne": return actual !== expected;
      case "in": return Array.isArray(expected) && expected.includes(actual);
      case "nin": return Array.isArray(expected) && !expected.includes(actual);
      case "gt": return typeof actual === "number" && typeof expected === "number" && actual > expected;
      case "lt": return typeof actual === "number" && typeof expected === "number" && actual < expected;
      case "gte": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
      case "lte": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
      case "contains":
        if (Array.isArray(actual)) return actual.includes(expected);
        if (typeof actual === "string") return actual.includes(String(expected));
        return false;
      default: return false;
    }
  }

  private matchesResource(pattern: string, resource: string): boolean {
    if (pattern === "*") return true;
    if (pattern === resource) return true;
    // Wildcard: "flights:*" matches "flights:read"
    if (pattern.endsWith(":*")) {
      return resource.startsWith(pattern.slice(0, -2));
    }
    return false;
  }

  private checkSchedule(user: User, now: Date): AuthzResult {
    const sched = user.sessionConfig?.scheduleRestriction;
    if (!sched?.enabled) return { allowed: true };

    const localTime = new Date(now.toLocaleString("en-US", { timeZone: sched.timezone }));
    const day = localTime.getDay();
    const hour = localTime.getHours();

    if (sched.allowedDays.length > 0 && !sched.allowedDays.includes(day)) {
      return { allowed: false, reason: "ACCESS_SCHEDULE_BLOCKED" };
    }

    if (hour < sched.allowedHoursStart || hour >= sched.allowedHoursEnd) {
      return { allowed: false, reason: "ACCESS_SCHEDULE_BLOCKED" };
    }

    return { allowed: true };
  }

  private checkGeoRestriction(user: User, env?: AuthzContext["environment"]): AuthzResult {
    const config = user.sessionConfig;
    if (!config) return { allowed: true };

    if (config.allowedCountries && config.allowedCountries.length > 0) {
      if (env?.country && !config.allowedCountries.includes(env.country as string)) {
        return { allowed: false, reason: "ACCESS_GEOFENCE_BLOCKED" };
      }
    }

    return { allowed: true };
  }
}