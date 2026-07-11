import { and, gt, gte, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getReadDb } from "../../../db";
import { sessionsTable, usersTable } from "../../../db/schema";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();

export interface CohortRetentionRow {
  cohortWeek: string;
  cohortSize: number;
  retention: number[];
}

export interface AuthMethodMix {
  password: number;
  oauth: number;
  passkey: number;
  total: number;
}

export interface AnomalyTrendPoint {
  date: string;
  flaggedSessions: number;
}

// GET /analytics — cohort retention, auth-method mix, anomaly trends
router.get("/analytics", async (c) => {
  try {
    const db = getReadDb();
    const now = new Date();
    const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [cohortUsers, allUsersAuth, recentSessions] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(and(ne(usersTable.status, "deleted"), gte(usersTable.createdAt, twelveWeeksAgo))),
      db
        .select({
          passwordHash: usersTable.passwordHash,
          oauthProviders: usersTable.oauthProviders,
          passkeys: usersTable.passkeys,
        })
        .from(usersTable)
        .where(ne(usersTable.status, "deleted")),
      db
        .select({
          userId: sessionsTable.userId,
          lastActivityAt: sessionsTable.lastActivityAt,
          anomalyFlags: sessionsTable.anomalyFlags,
          createdAt: sessionsTable.createdAt,
        })
        .from(sessionsTable)
        .where(gt(sessionsTable.lastActivityAt, twelveWeeksAgo)),
    ]);

    const cohorts = buildCohortRetention(cohortUsers, recentSessions);
    const authMethodMix = buildAuthMethodMix(allUsersAuth);
    const anomalyTrends = buildAnomalyTrends(recentSessions, thirtyDaysAgo);

    return c.json({ cohorts, authMethodMix, anomalyTrends });
  } catch (err) {
    return internalError(c, logger, "Admin analytics error", err, "Failed to retrieve analytics");
  }
});

function weekStart(d: Date): string {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - day);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function buildCohortRetention(
  users: Array<{ id: string; createdAt: Date }>,
  sessions: Array<{ userId: string; lastActivityAt: Date }>
): CohortRetentionRow[] {
  const cohortMap = new Map<string, string[]>();
  for (const u of users) {
    const wk = weekStart(u.createdAt);
    const list = cohortMap.get(wk) ?? [];
    list.push(u.id);
    cohortMap.set(wk, list);
  }

  const activityByCohortWeek = new Map<string, Map<number, Set<string>>>();
  for (const s of sessions) {
    const user = users.find((u) => u.id === s.userId);
    if (!user) continue;
    const cohortWk = weekStart(user.createdAt);
    const cohortStart = new Date(`${cohortWk}T00:00:00.000Z`);
    const weekN = Math.floor(
      (s.lastActivityAt.getTime() - cohortStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    if (weekN < 0 || weekN > 8) continue;
    if (!activityByCohortWeek.has(cohortWk)) {
      activityByCohortWeek.set(cohortWk, new Map());
    }
    const weekMap = activityByCohortWeek.get(cohortWk)!;
    if (!weekMap.has(weekN)) weekMap.set(weekN, new Set());
    weekMap.get(weekN)!.add(s.userId);
  }

  const rows: CohortRetentionRow[] = [];
  for (const [cohortWeek, memberIds] of [...cohortMap.entries()].sort()) {
    const cohortSize = memberIds.length;
    const weekMap = activityByCohortWeek.get(cohortWeek) ?? new Map();
    const retention: number[] = [];
    for (let w = 0; w <= 8; w++) {
      const activeSet = weekMap.get(w) ?? new Set();
      const pct = cohortSize > 0 ? Math.round((activeSet.size / cohortSize) * 100) : 0;
      retention.push(pct);
    }
    rows.push({ cohortWeek, cohortSize, retention });
  }
  return rows;
}

function buildAuthMethodMix(
  users: Array<{
    passwordHash: string | null;
    oauthProviders: unknown;
    passkeys: unknown;
  }>
): AuthMethodMix {
  let password = 0;
  let oauth = 0;
  let passkey = 0;

  for (const u of users) {
    const hasPasskey = Array.isArray(u.passkeys) && u.passkeys.length > 0;
    const hasOauth =
      Array.isArray(u.oauthProviders) && (u.oauthProviders as unknown[]).length > 0;
    const hasPassword = Boolean(u.passwordHash);

    if (hasPasskey) passkey++;
    if (hasOauth) oauth++;
    if (hasPassword) password++;
  }

  return { password, oauth, passkey, total: users.length };
}

function buildAnomalyTrends(
  sessions: Array<{ createdAt: Date; anomalyFlags: unknown }>,
  since: Date
): AnomalyTrendPoint[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.createdAt < since) continue;
    if (!s.anomalyFlags) continue;
    const flags = s.anomalyFlags as Record<string, unknown>;
    const hasFlag = Object.keys(flags).length > 0;
    if (!hasFlag) continue;
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, flaggedSessions]) => ({ date, flaggedSessions }));
}

export default router;
