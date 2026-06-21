import { Hono } from "hono";
import { getLogger } from "../logger/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimiting.js";
import { getClientIp } from "../shared/clientIp.js";
import type { HonoEnv } from "../shared/types.js";
import { exchangeToken } from "./exchange.js";
import { listProviders, registerProvider, removeProvider } from "./registry.js";
import type { FederationTokenRequest } from "./types.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("federation-routes");

const ISSUER = process.env.APP_URL ?? "http://localhost:3000";

// POST /federation/token-exchange — public
router.post("/token-exchange", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    const body = (await c.req.json()) as FederationTokenRequest;
    if (!body.subjectToken || !body.providerId) {
      return c.json(
        { error: "INVALID_REQUEST", message: "subjectToken and providerId required" },
        400
      );
    }
    const ip = getClientIp(c) || "unknown";
    const result = await exchangeToken(body, ip);
    return c.json(result);
  } catch (err) {
    logger.warn("Token exchange failed", { error: String(err) });
    return c.json({ error: "EXCHANGE_FAILED", message: String(err) }, 400);
  }
});

// GET /federation/discovery — public
router.get("/discovery", async (c) => {
  const providers = await listProviders();
  return c.json({
    issuer: ISSUER,
    tokenExchangeEndpoint: `${ISSUER}/federation/token-exchange`,
    supportedProviders: providers.filter((p) => p.enabled).map((p) => p.id),
  });
});

// GET /federation/providers — admin only
router.get("/providers", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!Array.isArray(user?.roles) || !user.roles.includes("admin")) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  return c.json({ providers: await listProviders() });
});

// POST /federation/providers — admin only
router.post("/providers", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!Array.isArray(user?.roles) || !user.roles.includes("admin")) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  try {
    const body = (await c.req.json()) as {
      id: string;
      name: string;
      issuerUrl: string;
      jwksUri?: string;
      trustedTenantId?: string;
      enabled?: boolean;
    };
    if (!body.id || !body.name || !body.issuerUrl) {
      return c.json({ error: "INVALID_REQUEST", message: "id, name, issuerUrl required" }, 400);
    }
    const provider = await registerProvider({ enabled: true, ...body });
    return c.json(provider, 201);
  } catch (err) {
    logger.warn("Provider registration failed", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /federation/providers/:id — admin only
router.delete("/providers/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!Array.isArray(user?.roles) || !user.roles.includes("admin")) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  const removed = await removeProvider(c.req.param("id"));
  return c.json({ success: removed });
});

export default router;
