import { and, eq, gt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { jitAccessTable } from "../db/schema";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";
import { ErrorCodes } from "../shared/types";

const logger = getLogger("temporal-access");

function getLocalHourAndDay(timezone?: string) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);

    const dayPart = parts.find((p) => p.type === "weekday")?.value || "";
    const hourPart = parts.find((p) => p.type === "hour")?.value || "0";
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return { day: dayMap[dayPart] ?? new Date().getDay(), hour: parseInt(hourPart, 10), tz };
  } catch {
    const d = new Date();
    return { day: d.getUTCDay(), hour: d.getUTCHours(), tz: "UTC" };
  }
}

export function temporalAccessMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    try {
      const user = c.get("user");
      if (!user) return next();

      const sched = (user.sessionConfig as any)?.scheduleRestriction;
      if (!sched?.enabled) return next();

      const { day, hour } = getLocalHourAndDay(sched.timezone);
      const allowedDays: number[] = Array.isArray(sched.allowedDays) ? sched.allowedDays : [];
      const start = Number(sched.allowedHoursStart ?? 0);
      const end = Number(sched.allowedHoursEnd ?? 23);

      const withinDay = allowedDays.length === 0 || allowedDays.includes(day);
      const withinHours = hour >= start && hour <= end;

      if (withinDay && withinHours) return next();

      // Check for active JIT grant
      const userId = user.id;
      if (!userId) {
        return c.json(
          { error: ErrorCodes.ACCESS_DENIED, message: "Access not allowed at this time" },
          403
        );
      }

      const now = new Date();
      const jitRows = await getDb()
        .select()
        .from(jitAccessTable)
        .where(
          and(
            eq(jitAccessTable.userId, userId),
            eq(jitAccessTable.status, "approved"),
            gt(jitAccessTable.expiresAt, now)
          )
        )
        .limit(1);

      if (jitRows.length > 0) {
        logger.info("JIT grant found allowing temporal access", { userId, jitId: jitRows[0].id });
        return next();
      }

      logger.warn("Access denied by temporal policy", { userId, day, hour });
      return c.json(
        { error: ErrorCodes.ACCESS_DENIED, message: "Access not allowed at this time" },
        403
      );
    } catch (err) {
      logger.error("Temporal access middleware error", err as Error);
      return next();
    }
  });
}
