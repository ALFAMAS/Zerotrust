import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, getReadDb } from "../../db/index.js";
import { userBehaviorBaselinesTable, usersTable } from "../../db/schema/index.js";
import { getLogger } from "../../logger/index.js";

const logger = getLogger("anomaly-detection");
const MAX_KNOWN_ITEMS = 20;

interface RollingStats {
  mean: number;
  variance: number;
  count: number;
}

function updateStats(stats: RollingStats, value: number): RollingStats {
  const count = stats.count + 1;
  const delta = value - stats.mean;
  const mean = stats.mean + delta / count;
  const delta2 = value - mean;
  const variance =
    count > 1 ? (stats.variance * (stats.count - 1) + delta * delta2) / (count - 1) : 0;
  return { mean, variance, count };
}

function anomalyScore(value: number, stats: RollingStats): number {
  if (stats.count < 5) return 0;
  const std = Math.sqrt(stats.variance) || 1;
  return Math.min(1, Math.abs(value - stats.mean) / std / 3);
}

export interface AnomalySignals {
  unknownIp: boolean;
  unknownCountry: boolean;
  unknownDevice: boolean;
  unusualHour: boolean;
  overallScore: number;
  flags: string[];
}

export interface BehaviorObservation {
  userId: string;
  ip: string;
  country: string | null;
  deviceHash: string;
  loginHour: number;
}

export async function getBaseline(userId: string) {
  const db = getReadDb();
  const rows = await db
    .select()
    .from(userBehaviorBaselinesTable)
    .where(eq(userBehaviorBaselinesTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function scoreAnomaly(obs: BehaviorObservation): Promise<AnomalySignals> {
  const baseline = await getBaseline(obs.userId);
  const flags: string[] = [];

  if (!baseline || (baseline.totalLogins as number) < 3) {
    return {
      unknownIp: false,
      unknownCountry: false,
      unknownDevice: false,
      unusualHour: false,
      overallScore: 0,
      flags,
    };
  }

  const knownIps = (baseline.knownIps as string[]) ?? [];
  const knownCountries = (baseline.knownCountries as string[]) ?? [];
  const knownDevices = (baseline.knownDevices as string[]) ?? [];
  const hourStats = (baseline.loginHourStats as RollingStats) ?? {
    mean: 12,
    variance: 25,
    count: 0,
  };

  const unknownIp = knownIps.length > 0 && !knownIps.includes(obs.ip);
  const unknownCountry =
    obs.country !== null && knownCountries.length > 0 && !knownCountries.includes(obs.country);
  const unknownDevice = knownDevices.length > 0 && !knownDevices.includes(obs.deviceHash);
  const hourScore = anomalyScore(obs.loginHour, hourStats);
  const unusualHour = hourScore > 0.7;

  if (unknownIp) flags.push("unknown_ip");
  if (unknownCountry) flags.push("unknown_country");
  if (unknownDevice) flags.push("unknown_device");
  if (unusualHour) flags.push("unusual_hour");

  const boolScore =
    [unknownIp, unknownCountry, unknownDevice, unusualHour].filter(Boolean).length / 4;
  const overallScore = Math.min(1, boolScore * 0.7 + hourScore * 0.3);

  return { unknownIp, unknownCountry, unknownDevice, unusualHour, overallScore, flags };
}

export async function updateBaseline(obs: BehaviorObservation): Promise<void> {
  try {
    const db = getDb();
    const existing = await getBaseline(obs.userId);

    // Verify user exists
    const userRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, obs.userId))
      .limit(1);
    if (userRows.length === 0) return;

    if (!existing) {
      await db.insert(userBehaviorBaselinesTable).values({
        userId: obs.userId,
        loginHourStats: { mean: obs.loginHour, variance: 0, count: 1 },
        sessionDurationStats: { mean: 1800, variance: 360000, count: 0 },
        knownIps: [obs.ip],
        knownCountries: obs.country ? [obs.country] : [],
        knownDevices: [obs.deviceHash],
        totalLogins: 1,
        lastUpdatedAt: new Date(),
      });
      return;
    }

    const hourStats = updateStats(existing.loginHourStats as RollingStats, obs.loginHour);

    const addUnique = (arr: string[], item: string) => {
      if (arr.includes(item)) return arr;
      return [...arr, item].slice(-MAX_KNOWN_ITEMS);
    };

    const knownIps = addUnique((existing.knownIps as string[]) ?? [], obs.ip);
    const knownCountries = obs.country
      ? addUnique((existing.knownCountries as string[]) ?? [], obs.country)
      : ((existing.knownCountries as string[]) ?? []);
    const knownDevices = addUnique((existing.knownDevices as string[]) ?? [], obs.deviceHash);

    await db
      .update(userBehaviorBaselinesTable)
      .set({
        loginHourStats: hourStats,
        knownIps,
        knownCountries,
        knownDevices,
        totalLogins: ((existing.totalLogins as number) ?? 0) + 1,
        lastUpdatedAt: new Date(),
      })
      .where(eq(userBehaviorBaselinesTable.userId, obs.userId));
  } catch (err) {
    logger.warn("Failed to update behavior baseline", { userId: obs.userId, error: String(err) });
  }
}

export async function resetBaseline(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(userBehaviorBaselinesTable).where(eq(userBehaviorBaselinesTable.userId, userId));
}

export function computeDeviceHash(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
}
