import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptionsTable } from "../db/schema";
import { planAllows, type Plan } from "../shared/plans";
import type { HonoEnv } from "../shared/types";

export function requirePlan(feature: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    const db = getDb();
    const [sub] = await db
      .select({ plan: subscriptionsTable.plan, status: subscriptionsTable.status })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);

    const plan = (
      sub?.status === "active" || sub?.status === "trialing" ? sub.plan : "free"
    ) as Plan;

    if (!planAllows(plan, feature)) {
      return c.json({ error: "PLAN_REQUIRED", requiredFeature: feature, currentPlan: plan }, 403);
    }

    return next();
  });
}
