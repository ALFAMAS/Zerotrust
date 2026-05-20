import express from "express";
import { createWorkloadCredential, validateWorkloadCredential } from "../../workload";
import { getLogger } from "../../logger";

const router = express.Router();
const logger = getLogger("workload-routes");

// Simple issuance endpoint protected by WORKLOAD_ISSUE_KEY env var
router.post("/issue", async (req, res) => {
  try {
    const key = req.headers["x-workload-key"] as string | undefined;
    if (!process.env.WORKLOAD_ISSUE_KEY || key !== process.env.WORKLOAD_ISSUE_KEY) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const { workloadId, scopes, ttl } = req.body as any;
    if (!workloadId) return res.status(400).json({ error: "INVALID_REQUEST" });

    const created = await createWorkloadCredential(
      workloadId,
      undefined,
      scopes || [],
      ttl || 3600
    );
    res.json({ created });
  } catch (err) {
    logger.error("Issue workload credential failed", err as Error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/validate", async (req, res) => {
  try {
    const { workloadId, secret } = req.body as any;
    if (!workloadId || !secret) return res.status(400).json({ error: "INVALID_REQUEST" });
    const ok = await validateWorkloadCredential(workloadId, secret);
    res.json({ valid: ok });
  } catch (err) {
    logger.error("Validate workload credential failed", err as Error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
