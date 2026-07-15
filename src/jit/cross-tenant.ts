/**
 * Cross-Tenant JIT (Just-In-Time) Privilege Escalation
 *
 * Allows a user in org A to request temporary elevated access to a resource
 * in org B. Requires approval from an admin in org B.
 *
 * Backed by the `cross_tenant_jit_requests` table so grants and the approval
 * trail survive restarts. Expiry is computed lazily: an approved grant whose
 * `expiresAt` has passed is reported (and treated) as "expired".
 */

import { and, desc, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { crossTenantJITRequestsTable } from "../db/schema";
import type { HonoEnv } from "../shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrossTenantJITRequest {
  id: string;
  requestorUserId: string;
  requestorOrgId: string;
  targetOrgId: string;
  targetResource: string; // e.g. "admin:users:read"
  justification: string;
  ttlSeconds: number; // max 3600 (1 hour)
  status: "pending" | "approved" | "denied" | "expired";
  approvedBy?: string; // userId of approver in target org
  approvedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

type JITRow = typeof crossTenantJITRequestsTable.$inferSelect;

/**
 * Map a DB row to the public shape, deriving "expired" for approved grants
 * whose TTL has elapsed (we never schedule a timer — expiry is read-time).
 */
function fromRow(row: JITRow): CrossTenantJITRequest {
  let status = row.status as CrossTenantJITRequest["status"];
  if (status === "approved" && row.expiresAt && row.expiresAt <= new Date()) {
    status = "expired";
  }
  return {
    id: row.id,
    requestorUserId: row.requestorUserId,
    requestorOrgId: row.requestorOrgId,
    targetOrgId: row.targetOrgId,
    targetResource: row.targetResource,
    justification: row.justification,
    ttlSeconds: row.ttlSeconds,
    status,
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
    createdAt: row.createdAt,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

class CrossTenantJITStore {
  /** Create a new cross-tenant JIT request. */
  async create(
    req: Omit<CrossTenantJITRequest, "id" | "status" | "createdAt">
  ): Promise<CrossTenantJITRequest> {
    const db = getDb();
    const ttl = Math.min(req.ttlSeconds ?? 3600, 3600);
    const [row] = await db
      .insert(crossTenantJITRequestsTable)
      .values({
        requestorUserId: req.requestorUserId,
        requestorOrgId: req.requestorOrgId,
        targetOrgId: req.targetOrgId,
        targetResource: req.targetResource,
        justification: req.justification,
        ttlSeconds: ttl,
        status: "pending",
      })
      .returning();
    return fromRow(row);
  }

  /** Retrieve a request by ID. */
  async get(id: string): Promise<CrossTenantJITRequest | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(crossTenantJITRequestsTable)
      .where(eq(crossTenantJITRequestsTable.id, id))
      .limit(1);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /**
   * Approve a pending request: set status, record approver, and compute
   * expiresAt = now + ttl. Returns null if the request is not pending.
   */
  async approve(id: string, approverId: string): Promise<CrossTenantJITRequest | null> {
    const db = getDb();
    const existing = await db
      .select()
      .from(crossTenantJITRequestsTable)
      .where(eq(crossTenantJITRequestsTable.id, id))
      .limit(1);
    if (existing[0]?.status !== "pending") return null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + existing[0].ttlSeconds * 1000);
    const [updated] = await db
      .update(crossTenantJITRequestsTable)
      .set({ status: "approved", approvedBy: approverId, approvedAt: now, expiresAt })
      .where(
        and(
          eq(crossTenantJITRequestsTable.id, id),
          eq(crossTenantJITRequestsTable.status, "pending")
        )
      )
      .returning();
    return updated ? fromRow(updated) : null;
  }

  /** Deny a pending request. Returns null if not pending. */
  async deny(id: string, approverId: string): Promise<CrossTenantJITRequest | null> {
    const db = getDb();
    const [row] = await db
      .update(crossTenantJITRequestsTable)
      .set({ status: "denied", approvedBy: approverId, approvedAt: new Date() })
      .where(
        and(
          eq(crossTenantJITRequestsTable.id, id),
          eq(crossTenantJITRequestsTable.status, "pending")
        )
      )
      .returning();
    return row ? fromRow(row) : null;
  }

  /** List all requests made by a specific user in a specific org. */
  async listByRequestor(userId: string, orgId: string): Promise<CrossTenantJITRequest[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(crossTenantJITRequestsTable)
      .where(
        and(
          eq(crossTenantJITRequestsTable.requestorUserId, userId),
          eq(crossTenantJITRequestsTable.requestorOrgId, orgId)
        )
      );
    return rows.map(fromRow);
  }

  /** List all requests targeting a specific org. */
  async listByTarget(orgId: string): Promise<CrossTenantJITRequest[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(crossTenantJITRequestsTable)
      .where(eq(crossTenantJITRequestsTable.targetOrgId, orgId));
    return rows.map(fromRow);
  }

  /** List requests across all orgs — system-admin surfaces only. */
  async listAll(): Promise<CrossTenantJITRequest[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(crossTenantJITRequestsTable)
      .orderBy(desc(crossTenantJITRequestsTable.createdAt));
    return rows.map(fromRow);
  }

  /** Check if a request is currently active (approved and not expired). */
  async isActive(id: string): Promise<boolean> {
    const req = await this.get(id);
    return req?.status === "approved" && !!req.expiresAt && req.expiresAt > new Date();
  }
}

export const crossTenantJITStore = new CrossTenantJITStore();

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Hono middleware that validates the caller has an active cross-tenant
 * JIT grant for the given target org and resource.
 *
 * Reads the grant ID from the X-JIT-Grant-ID request header.
 */
export function requireCrossTenantJIT(targetOrgId: string, resource: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const grantId = c.req.header("x-jit-grant-id");

    if (!grantId) {
      return c.json(
        {
          error: "JIT_GRANT_REQUIRED",
          message: "X-JIT-Grant-ID header is required for cross-tenant access",
        },
        403
      );
    }

    const grant = await crossTenantJITStore.get(grantId);

    if (!grant) {
      return c.json({ error: "JIT_GRANT_NOT_FOUND", message: "JIT grant not found" }, 403);
    }

    if (!(await crossTenantJITStore.isActive(grantId))) {
      return c.json(
        {
          error: "JIT_GRANT_INACTIVE",
          message: `JIT grant is not active (status: ${grant.status})`,
        },
        403
      );
    }

    if (grant.targetOrgId !== targetOrgId) {
      return c.json(
        { error: "JIT_GRANT_ORG_MISMATCH", message: "JIT grant targets a different organization" },
        403
      );
    }

    if (grant.targetResource !== resource) {
      return c.json(
        {
          error: "JIT_GRANT_RESOURCE_MISMATCH",
          message: `JIT grant is for resource "${grant.targetResource}", not "${resource}"`,
        },
        403
      );
    }

    return next();
  });
}

// ─── Request Helper ───────────────────────────────────────────────────────────

/**
 * Programmatically create a cross-tenant JIT access request.
 */
export function requestCrossTenantAccess(
  requestorUserId: string,
  requestorOrgId: string,
  targetOrgId: string,
  targetResource: string,
  justification: string,
  ttlSeconds: number = 3600
): Promise<CrossTenantJITRequest> {
  return crossTenantJITStore.create({
    requestorUserId,
    requestorOrgId,
    targetOrgId,
    targetResource,
    justification,
    ttlSeconds: Math.min(ttlSeconds, 3600),
  });
}
