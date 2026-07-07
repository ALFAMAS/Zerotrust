import { auditLog } from "../../logger";

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

/** Append login success to the tamper-evident audit chain. */
export function recordLoginSuccess(params: RecordLoginSuccessParams): void {
  const { userId, ip, method, sessionId } = params;
  const details = { method, ipAddress: ip, sessionId };

  void auditLog("auth.login.success", userId, userId, true, details);
}

/** Append failed login to the tamper-evident audit chain. */
export function recordLoginFailure(params: RecordLoginFailureParams): void {
  const { email, ip, reason, userId } = params;
  const actor = userId ?? email;
  const details = { reason, ipAddress: ip, email };

  void auditLog("auth.login.failure", actor, userId ?? email, false, details);
}
