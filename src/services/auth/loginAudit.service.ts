import { randomUUID } from "node:crypto";
import { auditLog } from "../../logger";
import { dispatchEvent } from "../../webhooks/delivery";

export type LoginMethod = "password" | "mfa";

export interface RecordLoginSuccessParams {
  userId: string;
  email: string;
  ip: string;
  method: LoginMethod;
  sessionId: string;
}

export interface RecordLoginFailureParams {
  email: string;
  ip: string;
  reason: string;
  userId?: string;
}

/** Append login success to the tamper-evident audit chain and dispatch webhooks. */
export function recordLoginSuccess(params: RecordLoginSuccessParams): void {
  const { userId, email, ip, method, sessionId } = params;
  const details = { method, ipAddress: ip, sessionId };

  void auditLog("auth.login.success", userId, userId, true, details);
  void dispatchEvent("auth.login.success", {
    eventId: `login:${sessionId}`,
    userId,
    email,
    method,
    ipAddress: ip,
    sessionId,
  });
}

/** Append failed login to the tamper-evident audit chain and dispatch webhooks. */
export function recordLoginFailure(params: RecordLoginFailureParams): void {
  const { email, ip, reason, userId } = params;
  const actor = userId ?? email;
  const details = { reason, ipAddress: ip, email };

  void auditLog("auth.login.failure", actor, userId ?? email, false, details);
  void dispatchEvent("auth.login.failure", {
    eventId: `login-fail:${randomUUID()}`,
    userId: userId ?? null,
    email,
    reason,
    ipAddress: ip,
  });
}
