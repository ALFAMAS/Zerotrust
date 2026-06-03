import { Hono } from "hono";
import { createWorkloadCredential, validateWorkloadCredential } from "../../workload";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("workload-routes");

router.post("/issue", async (c) => {
  try {
    const key = c.req.header("x-workload-key");
    if (!process.env.WORKLOAD_ISSUE_KEY || key !== process.env.WORKLOAD_ISSUE_KEY) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const { workloadId, scopes, ttl } = await c.req.json();
    if (!workloadId) return c.json({ error: "INVALID_REQUEST" }, 400);

    const created = await createWorkloadCredential(workloadId, undefined, scopes || [], ttl || 3600);
    return c.json({ created });
  } catch (err) {
    logger.error("Issue workload credential failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

router.post("/validate", async (c) => {
  try {
    const { workloadId, secret } = await c.req.json();
    if (!workloadId || !secret) return c.json({ error: "INVALID_REQUEST" }, 400);
    const ok = await validateWorkloadCredential(workloadId, secret);
    return c.json({ valid: ok });
  } catch (err) {
    logger.error("Validate workload credential failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
