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

export interface AuditDayVolume {
  date: Date;
  count: number;
}

/** Bucket audit entries into daily counts for the last `days` calendar days (UTC). */
export function auditVolumeByDay(entries: AuditEntry[], days = 14): AuditDayVolume[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }

  for (const entry of entries) {
    const raw = entry.timestamp ?? entry.createdAt;
    if (!raw) continue;
    const key = new Date(raw).toISOString().slice(0, 10);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([key, count]) => ({
    date: new Date(`${key}T00:00:00.000Z`),
    count,
  }));
}
