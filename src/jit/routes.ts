/**
 * Cross-Tenant JIT Routes
 * Mounted at /jit/cross-tenant
 */

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getReadDb } from "../db";
import { organizationMembersTable } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { orgRlsMiddleware } from "../middleware/orgRls";
import type { HonoEnv } from "../shared/types";
import { crossTenantJITStore, requestCrossTenantAccess } from "./cross-tenant";

const app = new Hono<HonoEnv>();

app.use("*", authMiddleware);
app.use("*", orgRlsMiddleware({ allowQueryOrg: true }));

async function userOrgIds(userId: string): Promise<string[]> {
  const rows = await getReadDb()
    .select({ orgId: organizationMembersTable.orgId })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.userId, userId));
  return rows.map((r) => r.orgId);
}

async function resolveRequestorOrgId(
  userId: string,
  requestedOrgId?: string
): Promise<{ orgId: string } | { error: "NO_ORG" | "ORG_REQUIRED" | "FORBIDDEN" }> {
  const orgIds = await userOrgIds(userId);
  if (orgIds.length === 0) return { error: "NO_ORG" };
  if (requestedOrgId) {
    return orgIds.includes(requestedOrgId) ? { orgId: requestedOrgId } : { error: "FORBIDDEN" };
  }
  if (orgIds.length === 1) return { orgId: orgIds[0]! };
  return { error: "ORG_REQUIRED" };
}

// ─── POST / — create a cross-tenant JIT request ───────────────────────────────

app.post("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id;

  if (!userId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  const body = await c.req.json<{
    targetOrgId?: string;
    requestorOrgId?: string;
    targetResource?: string;
    justification?: string;
    ttlSeconds?: number;
  }>();

  const { targetOrgId, requestorOrgId, targetResource, justification, ttlSeconds } = body;

  if (!targetOrgId || !targetResource || !justification) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        message: "targetOrgId, targetResource, and justification are required",
      },
      400
    );
  }

  const source = await resolveRequestorOrgId(userId, requestorOrgId);
  if ("error" in source) {
    const status = source.error === "FORBIDDEN" ? 403 : 400;
    const message =
      source.error === "ORG_REQUIRED"
        ? "requestorOrgId is required when you belong to multiple organizations"
        : source.error === "NO_ORG"
          ? "You must belong to an organization to request cross-tenant access"
          : "You are not a member of the requested source organization";
    return c.json({ error: source.error, message }, status);
  }

  const ttl = Math.min(Number(ttlSeconds) || 3600, 3600);

  const jitRequest = await requestCrossTenantAccess(
    userId,
    source.orgId,
    targetOrgId,
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

  const orgId = c.req.query("orgId");
  const source = await resolveRequestorOrgId(userId, orgId);
  if ("error" in source) {
    const status = source.error === "FORBIDDEN" ? 403 : 400;
    return c.json({ error: source.error, message: "orgId query parameter required" }, status);
  }

  const requests = await crossTenantJITStore.listByRequestor(userId, source.orgId);
  return c.json(requests);
});

// ─── GET /incoming — list requests targeting my org (admin only) ───────────

app.get("/incoming", async (c) => {
  const user = c.get("user");
  const userRoles: string[] = user?.roles ?? [];
  const userId = user?.id;

  if (!userId) {
    return c.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, 401);
  }

  // Without an explicit orgId: system admins get the cross-org inbox
  // (they may view any org's inbox anyway); org members resolve to their
  // only org, and the membership/role check below still gates access.
  const isSystemAdmin = userRoles.includes("admin") || userRoles.includes("tenant_admin");
  let targetOrgId = c.req.query("orgId");
  if (!targetOrgId) {
    if (isSystemAdmin) {
      return c.json(await crossTenantJITStore.listAll());
    }
    const source = await resolveRequestorOrgId(userId);
    if ("error" in source) {
      const message =
        source.error === "ORG_REQUIRED"
          ? "orgId query parameter is required when you belong to multiple organizations"
          : "You must belong to an organization to view incoming JIT requests";
      return c.json({ error: source.error, message }, 400);
    }
    targetOrgId = source.orgId;
  }

  const [membership] = await getReadDb()
    .select({ role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.orgId, targetOrgId),
        eq(organizationMembersTable.userId, userId)
      )
    )
    .limit(1);

  const isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
  if (!isOrgAdmin && !userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Org admin role required to view incoming JIT requests" },
      403
    );
  }

  const requests = await crossTenantJITStore.listByTarget(targetOrgId);
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

  const jitRequest = await crossTenantJITStore.get(id);

  if (!jitRequest) {
    return c.json({ error: "NOT_FOUND", message: `JIT request ${id} not found` }, 404);
  }

  const [membership] = await getReadDb()
    .select({ role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.orgId, jitRequest.targetOrgId),
        eq(organizationMembersTable.userId, approverId)
      )
    )
    .limit(1);

  const isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
  if (!isOrgAdmin && !userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Org admin role required to approve JIT requests" },
      403
    );
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

  const jitRequest = await crossTenantJITStore.get(id);

  if (!jitRequest) {
    return c.json({ error: "NOT_FOUND", message: `JIT request ${id} not found` }, 404);
  }

  const [membership] = await getReadDb()
    .select({ role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.orgId, jitRequest.targetOrgId),
        eq(organizationMembersTable.userId, approverId)
      )
    )
    .limit(1);

  const isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
  if (!isOrgAdmin && !userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    return c.json(
      { error: "ACCESS_DENIED", message: "Org admin role required to deny JIT requests" },
      403
    );
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
