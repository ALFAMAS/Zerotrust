import { Hono } from "hono";
import { getLogger } from "../logger/index.js";
import { authMiddleware } from "../middleware/auth.js";
import type { HonoEnv } from "../shared/types.js";
import { createLDAPClient } from "./client.js";
import { syncAllUsers } from "./sync.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("ldap-routes");

// Auth + admin guard on all LDAP routes
router.use("*", authMiddleware);
router.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  if (!user.roles?.includes("admin")) {
    return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
  }
  return next();
});

// GET /ldap/test — test LDAP connection
router.get("/test", async (c) => {
  const client = createLDAPClient();
  try {
    await client.bind();
    await client.close();
    return c.json({ connected: true });
  } catch (err) {
    logger.warn("LDAP connection test failed", { error: String(err) });
    return c.json({ connected: false, error: (err as Error).message }, 400);
  }
});

// POST /ldap/authenticate — authenticate a user against LDAP
router.post("/authenticate", async (c) => {
  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "INVALID_REQUEST", message: "Invalid JSON body" }, 400);
  }

  const { username, password } = body;
  if (!username || !password) {
    return c.json({ error: "INVALID_REQUEST", message: "username and password required" }, 400);
  }

  const client = createLDAPClient();
  try {
    const user = await client.authenticate(username, password);
    if (!user) {
      return c.json({ error: "INVALID_CREDENTIALS", message: "invalid_credentials" }, 401);
    }
    return c.json({ authenticated: true, user });
  } catch (err) {
    logger.error("LDAP authenticate route error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: (err as Error).message }, 500);
  } finally {
    await client.close().catch(() => {});
  }
});

// GET /ldap/users — search for users in LDAP directory
router.get("/users", async (c) => {
  const filter = c.req.query("filter");
  const client = createLDAPClient();
  try {
    await client.bind();
    const users = await client.searchUsers(filter);
    await client.close();
    return c.json({ users, total: users.length });
  } catch (err) {
    logger.error("LDAP users search error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: (err as Error).message }, 500);
  } finally {
    await client.close().catch(() => {});
  }
});

// POST /ldap/sync — trigger a manual LDAP sync
router.post("/sync", async (c) => {
  let tenantId: string | undefined;
  try {
    const body = await c.req.json();
    tenantId = body.tenantId;
  } catch {
    // tenantId is optional — ignore JSON parse errors
  }

  const client = createLDAPClient();
  try {
    const result = await syncAllUsers(client, tenantId);
    return c.json(result);
  } catch (err) {
    logger.error("LDAP sync error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: (err as Error).message }, 500);
  }
});

export default router;
