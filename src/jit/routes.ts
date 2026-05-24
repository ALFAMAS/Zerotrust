/**
 * Cross-Tenant JIT Routes
 * Mounted at /jit/cross-tenant
 */

import { Router, Request, Response } from "express";
import { crossTenantJITStore, requestCrossTenantAccess } from "./cross-tenant";

const router = Router();

// ─── POST / — create a cross-tenant JIT request ───────────────────────────────

router.post("/", (req: Request, res: Response): void => {
  const userId: string | undefined = (req as any).userId ?? req.user?._id?.toString();
  const tenantId: string | undefined = (req as any).tenantId ?? (req as any).tenant?.id;

  if (!userId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required" });
    return;
  }

  const { targetTenantId, targetResource, justification, ttlSeconds } = req.body as {
    targetTenantId?: string;
    targetResource?: string;
    justification?: string;
    ttlSeconds?: number;
  };

  if (!targetTenantId || !targetResource || !justification) {
    res.status(400).json({
      error: "INVALID_REQUEST",
      message: "targetTenantId, targetResource, and justification are required",
    });
    return;
  }

  const ttl = Math.min(Number(ttlSeconds) || 3600, 3600);

  const jitRequest = requestCrossTenantAccess(
    userId,
    tenantId ?? "default",
    targetTenantId,
    targetResource,
    justification,
    ttl
  );

  res.status(201).json(jitRequest);
});

// ─── GET / — list my cross-tenant JIT requests ───────────────────────────────

router.get("/", (req: Request, res: Response): void => {
  const userId: string | undefined = (req as any).userId ?? req.user?._id?.toString();
  const tenantId: string | undefined = (req as any).tenantId ?? (req as any).tenant?.id;

  if (!userId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required" });
    return;
  }

  const requests = crossTenantJITStore.listByRequestor(userId, tenantId ?? "default");
  res.json(requests);
});

// ─── GET /incoming — list requests targeting my tenant (admin only) ───────────

router.get("/incoming", (req: Request, res: Response): void => {
  const tenantId: string | undefined = (req as any).tenantId ?? (req as any).tenant?.id;
  const userRoles: string[] = req.user?.roles ?? [];

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    res.status(403).json({
      error: "ACCESS_DENIED",
      message: "Admin role required to view incoming JIT requests",
    });
    return;
  }

  const requests = crossTenantJITStore.listByTarget(tenantId ?? "default");
  res.json(requests);
});

// ─── POST /:id/approve — approve a JIT request ────────────────────────────────

router.post("/:id/approve", (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  const approverId: string | undefined = (req as any).userId ?? req.user?._id?.toString();
  const tenantId: string | undefined = (req as any).tenantId ?? (req as any).tenant?.id;
  const userRoles: string[] = req.user?.roles ?? [];

  if (!approverId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required" });
    return;
  }

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    res.status(403).json({
      error: "ACCESS_DENIED",
      message: "Admin role required to approve JIT requests",
    });
    return;
  }

  const jitRequest = crossTenantJITStore.get(id);

  if (!jitRequest) {
    res.status(404).json({ error: "NOT_FOUND", message: `JIT request ${id} not found` });
    return;
  }

  // Approver must be in the target tenant
  if (jitRequest.targetTenantId !== (tenantId ?? "default")) {
    res.status(403).json({
      error: "ACCESS_DENIED",
      message: "You can only approve requests targeting your tenant",
    });
    return;
  }

  const approved = crossTenantJITStore.approve(id, approverId);

  if (!approved) {
    res.status(409).json({
      error: "INVALID_STATE",
      message: `JIT request ${id} is not in pending state`,
    });
    return;
  }

  res.json(approved);
});

// ─── POST /:id/deny — deny a JIT request ─────────────────────────────────────

router.post("/:id/deny", (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  const approverId: string | undefined = (req as any).userId ?? req.user?._id?.toString();
  const tenantId: string | undefined = (req as any).tenantId ?? (req as any).tenant?.id;
  const userRoles: string[] = req.user?.roles ?? [];

  if (!approverId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required" });
    return;
  }

  if (!userRoles.includes("admin") && !userRoles.includes("tenant_admin")) {
    res.status(403).json({
      error: "ACCESS_DENIED",
      message: "Admin role required to deny JIT requests",
    });
    return;
  }

  const jitRequest = crossTenantJITStore.get(id);

  if (!jitRequest) {
    res.status(404).json({ error: "NOT_FOUND", message: `JIT request ${id} not found` });
    return;
  }

  if (jitRequest.targetTenantId !== (tenantId ?? "default")) {
    res.status(403).json({
      error: "ACCESS_DENIED",
      message: "You can only deny requests targeting your tenant",
    });
    return;
  }

  const denied = crossTenantJITStore.deny(id, approverId);

  if (!denied) {
    res.status(409).json({
      error: "INVALID_STATE",
      message: `JIT request ${id} is not in pending state`,
    });
    return;
  }

  res.json(denied);
});

export default router;
