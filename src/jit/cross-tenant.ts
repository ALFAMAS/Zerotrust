/**
 * Cross-Tenant JIT (Just-In-Time) Privilege Escalation
 *
 * Allows a user in tenant A to request temporary elevated access to a resource
 * in tenant B. Requires approval from an admin in tenant B.
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrossTenantJITRequest {
  id: string;
  requestorUserId: string;
  requestorTenantId: string;
  targetTenantId: string;
  targetResource: string;       // e.g. "admin:users:read"
  justification: string;
  ttlSeconds: number;           // max 3600 (1 hour)
  status: "pending" | "approved" | "denied" | "expired";
  approvedBy?: string;          // userId of approver in target tenant
  approvedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

// ─── Store ────────────────────────────────────────────────────────────────────

class CrossTenantJITStore {
  private requests = new Map<string, CrossTenantJITRequest>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Create a new cross-tenant JIT request.
   */
  create(
    req: Omit<CrossTenantJITRequest, "id" | "status" | "createdAt">
  ): CrossTenantJITRequest {
    const ttl = Math.min(req.ttlSeconds ?? 3600, 3600);
    const entry: CrossTenantJITRequest = {
      ...req,
      ttlSeconds: ttl,
      id: randomUUID(),
      status: "pending",
      createdAt: new Date(),
    };
    this.requests.set(entry.id, entry);
    return entry;
  }

  /**
   * Retrieve a request by ID.
   */
  get(id: string): CrossTenantJITRequest | null {
    return this.requests.get(id) ?? null;
  }

  /**
   * Approve a pending request.
   * Sets status to "approved", records approver info, calculates expiresAt,
   * and schedules automatic expiry.
   */
  approve(id: string, approverId: string): CrossTenantJITRequest | null {
    const req = this.requests.get(id);
    if (!req || req.status !== "pending") return null;

    const now = new Date();
    req.status = "approved";
    req.approvedBy = approverId;
    req.approvedAt = now;
    req.expiresAt = new Date(now.getTime() + req.ttlSeconds * 1000);

    this.requests.set(id, req);

    // Schedule auto-expiry
    const timer = setTimeout(() => {
      const current = this.requests.get(id);
      if (current && current.status === "approved") {
        current.status = "expired";
        this.requests.set(id, current);
      }
      this.expiryTimers.delete(id);
    }, req.ttlSeconds * 1000);

    // Allow the timer to be garbage-collected when the process exits
    if (timer.unref) timer.unref();

    this.expiryTimers.set(id, timer);

    return req;
  }

  /**
   * Deny a pending request.
   */
  deny(id: string, approverId: string): CrossTenantJITRequest | null {
    const req = this.requests.get(id);
    if (!req || req.status !== "pending") return null;

    req.status = "denied";
    req.approvedBy = approverId;
    req.approvedAt = new Date();
    this.requests.set(id, req);
    return req;
  }

  /**
   * List all requests made by a specific user in a specific tenant.
   */
  listByRequestor(userId: string, tenantId: string): CrossTenantJITRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.requestorUserId === userId && r.requestorTenantId === tenantId
    );
  }

  /**
   * List all requests targeting a specific tenant.
   */
  listByTarget(tenantId: string): CrossTenantJITRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.targetTenantId === tenantId
    );
  }

  /**
   * Check if a request is currently active (approved and not expired).
   */
  isActive(id: string): boolean {
    const req = this.requests.get(id);
    if (!req || req.status !== "approved") return false;
    if (!req.expiresAt) return false;
    return req.expiresAt > new Date();
  }
}

export const crossTenantJITStore = new CrossTenantJITStore();

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that validates the caller has an active cross-tenant
 * JIT grant for the given target tenant and resource.
 *
 * Reads the grant ID from the X-JIT-Grant-ID request header.
 */
export function requireCrossTenantJIT(
  targetTenantId: string,
  resource: string
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const grantId = req.headers["x-jit-grant-id"] as string | undefined;

    if (!grantId) {
      res.status(403).json({
        error: "JIT_GRANT_REQUIRED",
        message: "X-JIT-Grant-ID header is required for cross-tenant access",
      });
      return;
    }

    const grant = crossTenantJITStore.get(grantId);

    if (!grant) {
      res.status(403).json({
        error: "JIT_GRANT_NOT_FOUND",
        message: "JIT grant not found",
      });
      return;
    }

    if (!crossTenantJITStore.isActive(grantId)) {
      res.status(403).json({
        error: "JIT_GRANT_INACTIVE",
        message: `JIT grant is not active (status: ${grant.status})`,
      });
      return;
    }

    if (grant.targetTenantId !== targetTenantId) {
      res.status(403).json({
        error: "JIT_GRANT_TENANT_MISMATCH",
        message: "JIT grant targets a different tenant",
      });
      return;
    }

    if (grant.targetResource !== resource) {
      res.status(403).json({
        error: "JIT_GRANT_RESOURCE_MISMATCH",
        message: `JIT grant is for resource "${grant.targetResource}", not "${resource}"`,
      });
      return;
    }

    next();
  };
}

// ─── Request Helper ───────────────────────────────────────────────────────────

/**
 * Programmatically create a cross-tenant JIT access request.
 */
export function requestCrossTenantAccess(
  requestorUserId: string,
  requestorTenantId: string,
  targetTenantId: string,
  targetResource: string,
  justification: string,
  ttlSeconds: number = 3600
): CrossTenantJITRequest {
  return crossTenantJITStore.create({
    requestorUserId,
    requestorTenantId,
    targetTenantId,
    targetResource,
    justification,
    ttlSeconds: Math.min(ttlSeconds, 3600),
  });
}
