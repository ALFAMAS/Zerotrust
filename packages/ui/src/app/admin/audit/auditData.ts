export interface AuditEntry {
  id: string;
  timestamp?: string;
  createdAt?: string;
  user?: string;
  userEmail?: string;
  actorEmail?: string;
  userId?: string;
  action: string;
  ip?: string;
  ipAddress?: string;
  status?: "success" | "failure" | "error" | string;
  success?: boolean;
  entryHash?: string | null;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  resourceDetails?: Record<string, unknown>;
}

interface PaginatedAuditResponse {
  data?: AuditEntry[] | null;
  pagination?: unknown;
}

export function auditEntriesFromResponse(
  response: AuditEntry[] | PaginatedAuditResponse | null | undefined
): AuditEntry[] {
  if (Array.isArray(response)) return response;
  return response?.data ?? [];
}
