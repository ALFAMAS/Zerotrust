/**
 * Temporal Access middleware
 * - Enforces schedule-based restrictions from `user.sessionConfig.scheduleRestriction`
 * - Honors approved JIT grants that temporarily allow access
 */

import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../logger";
import { getConfig } from "../config";
import { JITModel } from "../models";
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

    // Map short day to number: Sun=0 .. Sat=6
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = dayMap[dayPart] ?? new Date().getDay();
    const hour = parseInt(hourPart, 10);
    return { day, hour, tz };
  } catch (e) {
    // Fallback to UTC
    const d = new Date();
    return { day: d.getUTCDay(), hour: d.getUTCHours(), tz: "UTC" };
  }
}

export function temporalAccessMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cfg = getConfig();
      // If temporal access control globally disabled, skip
      if (!cfg) return next();

      const user = req.user as any;
      if (!user || !user.sessionConfig || !user.sessionConfig.scheduleRestriction) return next();

      const sched = user.sessionConfig.scheduleRestriction;
      if (!sched.enabled) return next();

      const { day, hour, tz } = getLocalHourAndDay(sched.timezone || user.sessionConfig?.timezone);

      const allowedDays = Array.isArray(sched.allowedDays) ? sched.allowedDays : [];
      const start = Number(sched.allowedHoursStart ?? 0);
      const end = Number(sched.allowedHoursEnd ?? 23);

      const withinDay = allowedDays.length === 0 || allowedDays.includes(day);
      const withinHours = hour >= start && hour <= end;

      if (withinDay && withinHours) {
        return next();
      }

      // If not within scheduled window, check for active approved JIT grants
      const userId = user._id?.toString?.();
      if (!userId) {
        res
          .status(403)
          .json({ error: ErrorCodes.ACCESS_DENIED, message: "Access not allowed at this time" });
        return;
      }

      const now = new Date();
      const jit = await JITModel.findOne({
        userId,
        status: "approved",
        expiresAt: { $gt: now },
      }).sort({ expiresAt: -1 });
      if (jit) {
        logger.info("JIT grant found allowing temporal access", {
          userId,
          jitId: jit._id.toString(),
          tz,
        });
        return next();
      }

      logger.warn("Access denied by temporal policy", { userId, day, hour, tz });
      res
        .status(403)
        .json({ error: ErrorCodes.ACCESS_DENIED, message: "Access not allowed at this time" });
    } catch (err) {
      logger.error("Temporal access middleware error", err as Error);
      next();
    }
  };
}
