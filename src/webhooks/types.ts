export type WebhookEventType =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.mfa.enrolled"
  | "auth.mfa.verified"
  | "auth.mfa.failed"
  | "session.revoked"
  | "session.expired"
  | "user.created"
  | "user.updated"
  | "user.suspended"
  | "user.deleted"
  | "rate_limit.triggered"
  | "anomaly.detected"
  | "jit.requested"
  | "jit.approved"
  | "jit.denied";

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string; // HMAC-SHA256 signing secret
  events: WebhookEventType[];
  tenantId?: string;
  active: boolean;
  createdAt: Date;
  headers?: Record<string, string>; // custom headers to include
  retryPolicy: { maxRetries: number; backoffMs: number };
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEventType;
  payload: Record<string, unknown>;
  attempt: number;
  status: "pending" | "delivered" | "failed" | "retrying";
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  deliveredAt?: Date;
  nextRetryAt?: Date;
}
