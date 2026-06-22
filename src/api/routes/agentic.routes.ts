/**
 * Agentic approval + delegation routes.
 *
 * Endpoints:
 *   GET  /admin/approvals              — list pending approvals
 *   POST /admin/approvals/:id/approve   — approve a challenge
 *   POST /admin/approvals/:id/reject    — reject a challenge
 *   POST /auth/delegation/exchange      — exchange token with act-as delegation
 *   GET  /auth/delegation              — list active delegations
 */

import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { principalFromToken, describePrincipal, principalAuditFields } from "../../shared/principal";
import { insertAuditLog } from "../../audit/chain";
import type { HonoEnv } from "../../shared/types";
import {
  getPendingApprovals,
  getApproval,
  approveChallenge,
  rejectChallenge,
  approvalStats,
} from "../../services/approval.service";

const router = new Hono<HonoEnv>();
const logger = getLogger("agentic-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Admin: Human-in-the-loop approvals ────────────────────────────────────────

// GET /admin/approvals — list pending approvals
router.get("/admin/approvals", async (c) => {
  try {
    const user = c.get("user");
    if (!user?.roles.includes("admin")) {
      return c.json({ error: "ACCESS_DENIED" }, 403);
    }
    const pending = await getPendingApprovals();
    return c.json({ approvals: pending, stats: approvalStats() });
  } catch (err) {
    logger.error("Get approvals error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/approvals/:id/approve
router.post("/admin/approvals/:id/approve", async (c) => {
  try {
    const user = c.get("user");
    if (!user?.roles.includes("admin")) {
      return c.json({ error: "ACCESS_DENIED" }, 403);
    }
    const id = c.req.param("id");
    const challenge = await approveChallenge(id, user.id);

    if (!challenge) {
      return c.json({ error: "NOT_FOUND", message: "Approval not found or expired" }, 404);
    }

    await insertAuditLog({
      action: "DELEGATION_APPROVAL_APPROVED",
      actorId: user.id,
      actorEmail: user.email,
      targetId: id,
      targetType: "approval",
      success: true,
      metadata: { approvedFor: describePrincipal(challenge.principal), action: challenge.action },
    });

    return c.json({ success: true, approval: challenge });
  } catch (err) {
    logger.error("Approve error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/approvals/:id/reject
router.post("/admin/approvals/:id/reject", async (c) => {
  try {
    const user = c.get("user");
    if (!user?.roles.includes("admin")) {
      return c.json({ error: "ACCESS_DENIED" }, 403);
    }
    const id = c.req.param("id");
    const challenge = await rejectChallenge(id, user.id);

    if (!challenge) {
      return c.json({ error: "NOT_FOUND", message: "Approval not found or expired" }, 404);
    }

    await insertAuditLog({
      action: "DELEGATION_APPROVAL_REJECTED",
      actorId: user.id,
      actorEmail: user.email,
      targetId: id,
      targetType: "approval",
      success: true,
      metadata: { rejectedFor: describePrincipal(challenge.principal), action: challenge.action },
    });

    return c.json({ success: true, approval: challenge });
  } catch (err) {
    logger.error("Reject error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── On-behalf-of / act-as delegation ─────────────────────────────────────────

const delegationSchema = z.object({
  subjectUserId: z.string().uuid(),
  scope: z.array(z.string()).default(["read"]),
  expiresInSecs: z.number().int().min(60).max(86400).default(3600),
  reason: z.string().min(1).max(500),
});

// POST /auth/delegation/exchange — create a delegated token
router.post("/auth/delegation/exchange", async (c) => {
  try {
    const user = c.get("user");
    const token = c.get("token");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => ({}));
    const parsed = delegationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    const cfg = getConfig();
    const { TokenService } = await import("../../services/token.service.js");
    const svc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
    await svc.init();

    const sessionId = crypto.randomUUID();
    const delegatedToken = await svc.signAccessToken({
      sub: parsed.data.subjectUserId,
      sid: sessionId,
      aud: "delegation",
      scope: parsed.data.scope,
      principal_type: "human",
      act_as: [user.id],
    });

    await insertAuditLog({
      action: "DELEGATION_CREATED",
      actorId: user.id,
      actorEmail: user.email,
      targetId: parsed.data.subjectUserId,
      targetType: "delegation",
      success: true,
      metadata: {
        scope: parsed.data.scope,
        reason: parsed.data.reason,
        expires_in: parsed.data.expiresInSecs,
      },
    });

    logger.info("Delegation token created", { from: user.id, to: parsed.data.subjectUserId });

    return c.json({
      access_token: delegatedToken,
      token_type: "Bearer",
      expires_in: parsed.data.expiresInSecs,
      scope: parsed.data.scope.join(" "),
      delegated_to: parsed.data.subjectUserId,
      on_behalf_of: describePrincipal(principalFromToken(token)),
    });
  } catch (err) {
    logger.error("Delegation exchange error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /auth/delegation — show current delegation context
router.get("/auth/delegation", async (c) => {
  try {
    const principal = c.get("mcpPrincipal") ?? principalFromToken(c.get("token"));
    return c.json({
      principal: {
        type: principal.type,
        id: principal.id,
        workloadId: principal.workloadId,
        actAs: principal.actAs,
        description: describePrincipal(principal),
      },
    });
  } catch (err) {
    logger.error("Get delegation error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
