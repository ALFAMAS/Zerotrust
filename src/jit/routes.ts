/**
 * Cross-Tenant JIT Routes
 * Mounted at /jit/cross-tenant
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { HonoEnv } from "../shared/types";
import { crossTenantJITStore, requestCrossTenantAccess } from "./cross-tenant";

const app = new Hono<HonoEnv>();

app.use("*", authMiddleware);

// ─── POST / — create a cross-tenant JIT request ───────────────────────────────

app.post("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id;

  if (!userId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  const body = await c.req.json<{
    targetTenantId?: string;
    targetResource?: string;
    justification?: string;
    ttlSeconds?: number;
  }>();

  const { targetTenantId, targetResource, justification, ttlSeconds } = body;

  if (!targetTenantId || !targetResource || !justification) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        message: "targetTenantId, targetResource, and justification are required",
      },
      400
    );
  }

  const ttl = Math.min(Number(ttlSeconds) || 3600, 3600);

  const jitRequest = await requestCrossTenantAccess(
    userId,
    "default",
    targetTenantId,
    targetResource,
    justification,
    ttl
  );

  return c.json(jitRequest, 201);
});

// ─── GET / — list my cross-tenant JIT requests ───────────────────────────────

app.get("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id;

  if (!userId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  const requests = await crossTenantJITStore.listByRequestor(userId, "default");
  return c.json(requests);
});

// ─── GET /incoming — list requests targeting my tenant (admin only) ───────────

app.get("/incoming", async (c) => {
  const user = c.get("user");
  const userRoles: string[] = user?.roles ?? [];

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Admin role required to view incoming JIT requests" },
      403
    );
  }

  const requests = await crossTenantJITStore.listByTarget("default");
  return c.json(requests);
});

// ─── GET /status/:requestId — check status of a JIT request ──────────────────

app.get("/status/:requestId", async (c) => {
  const requestId = c.req.param("requestId");
  const jitRequest = await crossTenantJITStore.get(requestId);

  if (!jitRequest) {
    return c.json({ error: "NOT_FOUND", message: `JIT request ${requestId} not found` }, 404);
  }

  return c.json(jitRequest);
});

// ─── POST /:id/approve — approve a JIT request ────────────────────────────────

app.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const approverId = user?.id;
  const userRoles: string[] = user?.roles ?? [];

  if (!approverId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Admin role required to approve JIT requests" },
      403
    );
  }

  const jitRequest = await crossTenantJITStore.get(id);

  if (!jitRequest) {
    return c.json({ error: "NOT_FOUND", message: `JIT request ${id} not found` }, 404);
  }

  const approved = await crossTenantJITStore.approve(id, approverId);

  if (!approved) {
    return c.json(
      { error: "INVALID_STATE", message: `JIT request ${id} is not in pending state` },
      409
    );
  }

  return c.json(approved);
});

// ─── POST /:id/deny — deny a JIT request ─────────────────────────────────────

app.post("/:id/deny", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const approverId = user?.id;
  const userRoles: string[] = user?.roles ?? [];

  if (!approverId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Admin role required to deny JIT requests" },
      403
    );
  }

  const jitRequest = await crossTenantJITStore.get(id);

  if (!jitRequest) {
    return c.json({ error: "NOT_FOUND", message: `JIT request ${id} not found` }, 404);
  }

  const denied = await crossTenantJITStore.deny(id, approverId);

  if (!denied) {
    return c.json(
      { error: "INVALID_STATE", message: `JIT request ${id} is not in pending state` },
      409
    );
  }

  return c.json(denied);
});

export default app;
