import { randomUUID } from "node:crypto";
import {
  recordLoginFailure as auditLoginFailure,
  recordLoginSuccess as auditLoginSuccess,
  type LoginMethod,
  type RecordLoginFailureParams,
  type RecordLoginSuccessParams,
} from "../services/auth/loginAudit.service";
import { dispatchEvent } from "../webhooks/delivery";

export type { LoginMethod, RecordLoginFailureParams, RecordLoginSuccessParams };

/** Record login success in the audit chain and dispatch outbound webhooks. */
export function recordLoginSuccess(params: RecordLoginSuccessParams): void {
  const { userId, email, ip, method, sessionId } = params;
  auditLoginSuccess(params);
  void dispatchEvent("auth.login.success", {
    eventId: `login:${sessionId}`,
    userId,
    email,
    method,
    ipAddress: ip,
    sessionId,
  });
}

/** Record failed login in the audit chain and dispatch outbound webhooks. */
export function recordLoginFailure(params: RecordLoginFailureParams): void {
  const { email, ip, reason, userId } = params;
  auditLoginFailure(params);
  void dispatchEvent("auth.login.failure", {
    eventId: `login-fail:${randomUUID()}`,
    userId: userId ?? null,
    email,
    reason,
    ipAddress: ip,
  });
}
