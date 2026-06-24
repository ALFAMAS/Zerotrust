import { Hono } from "hono";
import { getConfig } from "../../config";
import { auditLog, getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { TokenService } from "../../services/token.service";
import type { HonoEnv } from "../../shared/types";
import {
  createWorkloadCredential,
  getValidWorkloadCredential,
  listWorkloadCredentials,
  revokeWorkloadCredential,
  validateWorkloadCredential,
} from "../../workload";

const router = new Hono<HonoEnv>();
const logger = getLogger("workload-routes");

let tokenServiceInstance: TokenService | null = null;
async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(
    cfg.security.tokenSecretHex,
    cfg.session,
  );
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

router.post("/issue", async (c) => {
  try {
    const key = c.req.header("x-workload-key");
    if (
      !process.env.WORKLOAD_ISSUE_KEY ||
      key !== process.env.WORKLOAD_ISSUE_KEY
    ) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const { workloadId, scopes, ttl } = await c.req.json();
    if (!workloadId) return c.json({ error: "INVALID_REQUEST" }, 400);

    const created = await createWorkloadCredential(
      workloadId,
      undefined,
      scopes || [],
      ttl || 3600,
    );
    return c.json({ created });
  } catch (err) {
    logger.error("Issue workload credential failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

router.post("/validate", async (c) => {
  try {
    const { workloadId, secret } = await c.req.json();
    if (!workloadId || !secret)
      return c.json({ error: "INVALID_REQUEST" }, 400);
    const ok = await validateWorkloadCredential(workloadId, secret);
    return c.json({ valid: ok });
  } catch (err) {
    logger.error("Validate workload credential failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

router.post("/token", async (c) => {
  try {
    const { workloadId, secret, scopes, ttl } = await c.req.json();
    if (!workloadId || !secret)
      return c.json({ error: "INVALID_REQUEST" }, 400);

    const credential = await getValidWorkloadCredential(workloadId, secret);
    if (!credential) {
      return c.json({ error: "INVALID_WORKLOAD_CREDENTIAL" }, 401);
    }

    const allowedScopes = new Set((credential.scopes as string[]) ?? []);
    const requestedScopes = Array.isArray(scopes)
      ? scopes.map(String)
      : Array.from(allowedScopes);
    const grantedScopes = requestedScopes.filter((scope) =>
      allowedScopes.has(scope),
    );
    if (
      requestedScopes.length > 0 &&
      grantedScopes.length !== requestedScopes.length
    ) {
      return c.json({ error: "INVALID_SCOPE" }, 403);
    }

    const tokenTtl = Math.min(
      Number.isInteger(ttl) ? ttl : credential.ttl || 3600,
      credential.ttl || 3600,
    );
    const tokenSvc = await getTokenService();
    const accessToken = await tokenSvc.signAccessToken(
      {
        sub: `workload:${credential.workloadId}`,
        email: `${credential.workloadId}@workload.zerotrust.local`,
        sid: crypto.randomUUID(),
        aud: "zerotrust",
        scope: grantedScopes,
        principal_type: "agent",
        workload_id: credential.workloadId,
      },
      tokenTtl,
    );

    void auditLog(
      "workload.token.issued",
      `workload:${credential.workloadId}`,
      credential.workloadId,
      true,
      { scopes: grantedScopes, ttl: tokenTtl },
      undefined,
      {
        type: "agent",
        id: `workload:${credential.workloadId}`,
        workloadId: credential.workloadId,
      },
    );

    return c.json({
      accessToken,
      expiresIn: tokenTtl,
      tokenType: "Bearer",
      principalType: "agent",
      workloadId: credential.workloadId,
      scopes: grantedScopes,
    });
  } catch (err) {
    logger.error("Issue workload token failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /credentials — list workload credentials (admin only, no secrets returned)
router.get("/credentials", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!Array.isArray(user?.roles) || !user.roles.includes("admin")) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  try {
    const credentials = await listWorkloadCredentials();
    return c.json({ credentials });
  } catch (err) {
    logger.error("List workload credentials failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /credentials/:id/revoke — revoke a workload credential (admin only)
router.post("/credentials/:id/revoke", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!Array.isArray(user?.roles) || !user.roles.includes("admin")) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  try {
    const ok = await revokeWorkloadCredential(c.req.param("id"));
    if (!ok) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Revoke workload credential failed", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
