import { Router } from "express";
import { createLDAPClient } from "./client";
import { syncAllUsers } from "./sync";

const router = Router();

router.post("/test", async (req, res) => {
  const client = createLDAPClient(req.body);
  try {
    await client.bind();
    await client.close();
    res.json({ connected: true });
  } catch (err) {
    res.status(400).json({ connected: false, error: (err as Error).message });
  }
});

router.post("/sync", async (req, res) => {
  const { tenantId } = req.body;
  const client = createLDAPClient();
  try {
    const result = await syncAllUsers(client, tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/authenticate", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  const client = createLDAPClient();
  try {
    const user = await client.authenticate(username, password);
    if (!user) return res.status(401).json({ error: "invalid_credentials" });
    res.json({ authenticated: true, user });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    await client.close().catch(() => {});
  }
});

router.get("/users", async (req, res) => {
  const { filter } = req.query as Record<string, string>;
  const client = createLDAPClient();
  try {
    await client.bind();
    const users = await client.searchUsers(filter);
    await client.close();
    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
