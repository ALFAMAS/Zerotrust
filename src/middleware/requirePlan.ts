import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { subscriptionsTable } from "../db/schema";
import { type Plan, planAllows } from "../shared/plans";
import type { HonoEnv } from "../shared/types";

export interface RequirePlanOptions {
  /** Route param name holding the org UUID (e.g. `orgId`). */
  orgIdParam?: string;
  /** Query param name holding the org UUID. */
  orgIdQuery?: string;
  /** Header name holding the org UUID (default: `x-org-id`). */
  orgIdHeader?: string;
}

async function resolvePlan(userId: string, orgId?: string): Promise<Plan> {
  const db = getDb();

  if (orgId) {
    const [orgSub] = await db
      .select({ plan: subscriptionsTable.plan, status: subscriptionsTable.status })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.orgId, orgId))
      .limit(1);
    if (orgSub?.status === "active" || orgSub?.status === "trialing") {
      return orgSub.plan as Plan;
    }
  }

  const [userSub] = await db
    .select({ plan: subscriptionsTable.plan, status: subscriptionsTable.status })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  return (
    userSub?.status === "active" || userSub?.status === "trialing" ? userSub.plan : "free"
  ) as Plan;
}

function readOrgId(c: Context<HonoEnv>, opts?: RequirePlanOptions): string | undefined {
  if (opts?.orgIdParam) {
    const fromParam = c.req.param(opts.orgIdParam);
    if (fromParam) return fromParam;
  }
  if (opts?.orgIdQuery) {
    const fromQuery = c.req.query(opts.orgIdQuery);
    if (fromQuery) return fromQuery;
  }
  const headerName = opts?.orgIdHeader ?? "x-org-id";
  return c.req.header(headerName) ?? undefined;
}

export function requirePlan(feature: string, opts?: RequirePlanOptions) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const orgId = readOrgId(c, opts);
    const plan = await resolvePlan(user.id, orgId);

    if (!planAllows(plan, feature)) {
      return c.json({ error: "PLAN_REQUIRED", requiredFeature: feature, currentPlan: plan }, 403);
    }

    return next();
  });
}

/** Exported for unit tests and quota checks that share the lookup order. */
export { resolvePlan };
