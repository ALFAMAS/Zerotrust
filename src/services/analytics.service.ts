import { eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { usersTable } from "../db/schema";


// ── Funnel tracking ──────────────────────────────────────────────────────────

export interface FunnelEvent {
  userId: string;
  step: "signup" | "email_verified" | "profile_complete" | "first_login" | "mfa_enabled" | "first_payment" | "activation";
  metadata?: Record<string, unknown>;
}

/**
 * Track a funnel step event for a user.
 */
export async function trackFunnelEvent(event: FunnelEvent): Promise<void> {
  const db = getDb();
  // Store funnel events in user metadata for simplicity
  const [user] = await db.select({ metadata: usersTable.metadata }).from(usersTable).where(eq(usersTable.id, event.userId)).limit(1);
  const meta = (user?.metadata as Record<string, unknown>) ?? {};
  const funnelEvents = (meta.funnelEvents as Record<string, string> ?? {});
  funnelEvents[event.step] = new Date().toISOString();
  await db.update(usersTable).set({ metadata: { ...meta, funnelEvents }, updatedAt: new Date() }).where(eq(usersTable.id, event.userId));
}

/**
 * Get funnel conversion counts for a given time period.
 */
export async function getFunnelCounts(startDate: Date, _endDate?: Date): Promise<Record<string, number>> {
  const db = getDb();
  const users = await db
    .select({ metadata: usersTable.metadata })
    .from(usersTable)
    .where(gte(usersTable.createdAt, startDate));

  const counts: Record<string, number> = {
    signup: 0,
    email_verified: 0,
    profile_complete: 0,
    first_login: 0,
    mfa_enabled: 0,
    first_payment: 0,
    activation: 0,
  };

  for (const user of users) {
    const funnel = ((user.metadata as any)?.funnelEvents as Record<string, string>) ?? {};
    for (const step of Object.keys(counts)) {
      if (funnel[step]) counts[step]++;
    }
  }

  return counts;
}

// ── Per-feature analytics ────────────────────────────────────────────────────

/**
 * Track a feature usage event.
 */
export async function trackFeatureEvent(userId: string, feature: string, action: string, metadata?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db.execute(sql`INSERT INTO analytics_events (id, user_id, feature, action, metadata, created_at) VALUES (gen_random_uuid(), ${userId}, ${feature}, ${action}, ${JSON.stringify(metadata ?? {})}, now())`).catch(() => {
    // Table may not exist yet — silently ignore
  });
}

/**
 * Get feature usage counts.
 */
export async function getFeatureUsage(feature: string, startDate: Date, endDate: Date): Promise<{ action: string; count: number }[]>{
  const db = getDb();
  try {
    const rows = await db.execute(sql`SELECT action, count(*)::int as count FROM analytics_events WHERE feature = ${feature} AND created_at >= ${startDate} AND created_at <= ${endDate} GROUP BY action ORDER BY count DESC`);
    return rows as any;
  } catch {
    return [];
  }
}

// ── Search analytics ─────────────────────────────────────────────────────────

/**
 * Log a search query (including zero-result queries).
 */
export async function logSearchQuery(userId: string | null, query: string, resultCount: number, source: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`INSERT INTO search_analytics (id, user_id, query, result_count, source, created_at) VALUES (gen_random_uuid(), ${userId}, ${query}, ${resultCount}, ${source}, now())`).catch(() => {
    // Table may not exist yet — silently ignore
  });
}

/**
 * Get zero-result search queries.
 */
export async function getZeroResultQueries(startDate: Date, endDate: Date, limit = 50): Promise<{ query: string; count: number }[]> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`SELECT query, count(*)::int as count FROM search_analytics WHERE result_count = 0 AND created_at >= ${startDate} AND created_at <= ${endDate} GROUP BY query ORDER BY count DESC LIMIT ${limit}`);
    return rows as any;
  } catch {
    return [];
  }
}
