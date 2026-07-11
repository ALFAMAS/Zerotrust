/**
 * Daily status snapshots for the public status page uptime history.
 * Uses Redis when available; falls back to an in-process ring buffer.
 */

import { getLogger } from "../../logger";
import { getRedis } from "../shared/rateLimiter/redis";

const logger = getLogger("status-history");

export type StatusComponentState = "operational" | "degraded" | "down" | "not set";

export interface StatusSnapshot {
  date: string; // YYYY-MM-DD
  status: "operational" | "degraded" | "down";
  components: Record<string, StatusComponentState>;
}

const MAX_DAYS = 90;
const REDIS_KEY = "zerotrust:status:history";
const memoryHistory: StatusSnapshot[] = [];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveOverall(
  components: Record<string, StatusComponentState>
): StatusSnapshot["status"] {
  const values = Object.values(components);
  if (values.includes("down")) return "down";
  if (values.includes("degraded")) return "degraded";
  return "operational";
}

function trimHistory(history: StatusSnapshot[]): StatusSnapshot[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return history.filter((s) => s.date >= cutoffStr).slice(-MAX_DAYS);
}

async function loadHistory(): Promise<StatusSnapshot[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StatusSnapshot[];
        if (Array.isArray(parsed)) return trimHistory(parsed);
      }
    } catch (err) {
      logger.warn("Failed to load status history from Redis", { error: String(err) });
    }
  }
  return trimHistory([...memoryHistory]);
}

async function saveHistory(history: StatusSnapshot[]): Promise<void> {
  const trimmed = trimHistory(history);
  memoryHistory.length = 0;
  memoryHistory.push(...trimmed);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_KEY, JSON.stringify(trimmed), "EX", MAX_DAYS * 86400);
    } catch (err) {
      logger.warn("Failed to save status history to Redis", { error: String(err) });
    }
  }
}

/** Record or update today's snapshot (called from GET /status). */
export async function recordStatusSnapshot(
  components: Record<string, StatusComponentState>
): Promise<void> {
  const date = todayKey();
  const snapshot: StatusSnapshot = {
    date,
    status: deriveOverall(components),
    components: { ...components },
  };

  const history = await loadHistory();
  const idx = history.findIndex((s) => s.date === date);
  if (idx >= 0) {
    // Keep the worst status seen today for uptime accuracy.
    const prev = history[idx]!;
    const rank = { operational: 0, degraded: 1, down: 2 };
    if (rank[snapshot.status] >= rank[prev.status]) {
      history[idx] = snapshot;
    }
  } else {
    history.push(snapshot);
  }
  await saveHistory(history);
}

/** Return recent daily snapshots (newest last). */
export async function getStatusHistory(days = 90): Promise<StatusSnapshot[]> {
  const limit = Math.min(Math.max(days, 1), MAX_DAYS);
  const history = await loadHistory();
  return history.slice(-limit);
}

/** Test helper — reset in-memory history. */
export function resetStatusHistoryForTests(): void {
  memoryHistory.length = 0;
}
