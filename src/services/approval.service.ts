/**
 * Human-in-the-loop approval for sensitive agent actions.
 *
 * When an agent attempts a sensitive action (e.g. deleting data, changing billing,
 * exporting PII), the system creates an approval challenge. A human must approve
 * before the action proceeds. This reuses the continuous-verification infrastructure.
 */

import { broadcastNotification } from "../api/routes/notification.routes";
import { getLogger } from "../logger";
import type { AuditPrincipal } from "../shared/principal";
import { describePrincipal, principalFromToken } from "../shared/principal";

const logger = getLogger("approval-service");

// In-memory store for pending approvals (use Redis/DB in production)
const pendingApprovals = new Map<string, ApprovalChallenge>();

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalChallenge {
  id: string;
  action: string; // e.g. "user.delete", "billing.cancel", "data.export"
  description: string;
  principal: AuditPrincipal;
  requestedAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: number;
  metadata?: Record<string, unknown>;
  // The token to return upon approval (for the agent to replay the action)
  executionToken?: string;
}

// ── Sensitive actions that require human approval ─────────────────────────────

const SENSITIVE_ACTIONS: Record<string, { description: string; requireReason: boolean }> = {
  "user.delete": { description: "Delete user account", requireReason: true },
  "user.role.change": { description: "Change user role", requireReason: true },
  "billing.cancel": { description: "Cancel subscription", requireReason: true },
  "billing.refund": { description: "Issue refund", requireReason: true },
  "data.export": {
    description: "Export user data (GDPR)",
    requireReason: false,
  },
  "org.delete": { description: "Delete organization", requireReason: true },
  "org.settings.security": {
    description: "Modify security policy",
    requireReason: false,
  },
  "api-key.create": { description: "Create API key", requireReason: false },
  "webhook.delete": { description: "Delete webhook", requireReason: false },
  "admin.impersonate": { description: "Impersonate user", requireReason: true },
};

export function isSensitiveAction(action: string): boolean {
  return action in SENSITIVE_ACTIONS;
}

export function requiresApproval(action: string): boolean {
  return action in SENSITIVE_ACTIONS;
}

// ── Create approval challenge ─────────────────────────────────────────────────

export async function createApprovalChallenge(params: {
  action: string;
  description?: string;
  principal: AuditPrincipal;
  metadata?: Record<string, unknown>;
  expiresInSecs?: number;
}): Promise<ApprovalChallenge> {
  const config = SENSITIVE_ACTIONS[params.action];
  if (!config) throw new Error(`Unknown sensitive action: ${params.action}`);

  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresIn = (params.expiresInSecs ?? 300) * 1000; // 5 min default

  const challenge: ApprovalChallenge = {
    id,
    action: params.action,
    description: params.description ?? config.description,
    principal: params.principal,
    requestedAt: now,
    expiresAt: now + expiresIn,
    status: "pending",
    metadata: params.metadata,
  };

  pendingApprovals.set(id, challenge);

  // Notify admins via in-app notification
  const principalDesc = describePrincipal(params.principal);
  broadcastNotification(params.principal.id, {
    type: "approval_required",
    title: "Approval Required",
    body: `${principalDesc} wants to: ${challenge.description}`,
    link: `/admin/approvals/${id}`,
    approvalId: id,
    action: params.action,
  });

  logger.info("Approval challenge created", {
    id,
    action: params.action,
    principal: params.principal,
  });

  return challenge;
}

// ── Check / get approval ──────────────────────────────────────────────────────

export async function getApproval(id: string): Promise<ApprovalChallenge | null> {
  const challenge = pendingApprovals.get(id);
  if (!challenge) return null;

  if (challenge.status === "pending" && challenge.expiresAt < Date.now()) {
    challenge.status = "expired";
  }

  return challenge;
}

export async function getPendingApprovals(): Promise<ApprovalChallenge[]> {
  const now = Date.now();
  const pending: ApprovalChallenge[] = [];
  for (const challenge of pendingApprovals.values()) {
    if (challenge.status === "pending" && challenge.expiresAt > now) {
      pending.push(challenge);
    }
  }
  return pending.sort((a, b) => b.requestedAt - a.requestedAt);
}

// ── Approve / reject ──────────────────────────────────────────────────────────

export async function approveChallenge(
  id: string,
  approvedBy: string
): Promise<ApprovalChallenge | null> {
  const challenge = pendingApprovals.get(id);
  if (!challenge) return null;

  if (challenge.status !== "pending" || challenge.expiresAt < Date.now()) {
    return null;
  }

  challenge.status = "approved";
  challenge.approvedBy = approvedBy;
  challenge.approvedAt = Date.now();

  // Generate execution token (short-lived, single-use)
  challenge.executionToken = crypto.randomUUID();

  logger.info("Approval granted", { id, action: challenge.action, approvedBy });

  return challenge;
}

export async function rejectChallenge(
  id: string,
  rejectedBy: string
): Promise<ApprovalChallenge | null> {
  const challenge = pendingApprovals.get(id);
  if (!challenge) return null;

  if (challenge.status !== "pending") return null;

  challenge.status = "rejected";
  challenge.approvedBy = rejectedBy;
  challenge.approvedAt = Date.now();

  logger.info("Approval rejected", {
    id,
    action: challenge.action,
    rejectedBy,
  });

  return challenge;
}

// ── Verify execution token ────────────────────────────────────────────────────

export function verifyExecutionToken(approvalId: string, token: string): boolean {
  const challenge = pendingApprovals.get(approvalId);
  if (!challenge) return false;
  if (challenge.status !== "approved") return false;
  if (challenge.executionToken !== token) return false;
  if (challenge.expiresAt < Date.now()) return false;
  return true;
}

// ── Middleware: require human approval for sensitive agent actions ─────────────

export function requireHumanApproval(action: string) {
  return async (c: any, next: any) => {
    const user = c.get("user");
    const token = c.get("token");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    // Only agent tokens require human approval
    const principal = principalFromToken(token);
    if (principal.type !== "agent") return next();

    // Check if action requires approval
    if (!requiresApproval(action)) return next();

    // Check for pre-approved execution token
    const execToken = c.req.header("x-approval-token");
    if (execToken && verifyExecutionToken(action, execToken)) {
      return next();
    }

    // Create approval challenge
    const challenge = await createApprovalChallenge({
      action,
      principal,
      metadata: { path: c.req.path, method: c.req.method },
    });

    return c.json(
      {
        error: "APPROVAL_REQUIRED",
        message: `Action "${action}" requires human approval`,
        approval_id: challenge.id,
        expires_at: new Date(challenge.expiresAt).toISOString(),
      },
      202
    );
  };
}

export function approvalStats() {
  const now = Date.now();
  let pending = 0,
    approved = 0,
    rejected = 0,
    expired = 0;
  for (const c of pendingApprovals.values()) {
    if (c.status === "pending" && c.expiresAt < now) expired++;
    else if (c.status === "pending") pending++;
    else if (c.status === "approved") approved++;
    else if (c.status === "rejected") rejected++;
  }
  return { pending, approved, rejected, expired, total: pendingApprovals.size };
}
