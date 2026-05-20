/**
 * GeoFencing middleware
 * - Uses geoip-lite to infer country from IP
 * - Enforces allowed countries and optional allowed IP CIDR ranges
 */

import type { Request, Response, NextFunction } from "express";
import geoip from "geoip-lite";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";

const logger = getLogger("geo-fencing");

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function cidrContains(cidr: string, ip: string): boolean {
  // cidr expected like '1.2.3.0/24'
  const [range, bits] = cidr.split("/");
  if (!bits) return range === ip;
  const mask = ~(2 ** (32 - Number(bits)) - 1) >>> 0;
  const ipNum = ipToLong(ip);
  const rangeNum = ipToLong(range);
  return (ipNum & mask) === (rangeNum & mask);
}

export function geoFencingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const cfg = getConfig();
      if (!cfg.geofencing.enabled) return next();

      const ipRaw = (req.ip || (req.headers["x-forwarded-for"] as string) || "")
        .split(",")[0]
        .trim();
      if (!ipRaw) return next();

      const geo = geoip.lookup(ipRaw);
      const country = geo?.country || "";

      // Attach inferred country for downstream auditors
      (req as any).inferredCountry = country;

      // Check allowed countries global + per-user (attached on req.user.sessionConfig.allowedCountries)
      const allowedGlobal = cfg.geofencing.allowedCountries.map((c) => c.trim().toUpperCase());
      const allowedUser = (req.user as any)?.sessionConfig?.allowedCountries || [];
      const allowed = new Set([
        ...allowedGlobal,
        ...allowedUser.map((c: string) => c.toUpperCase()),
      ]);

      if (allowed.size > 0 && !allowed.has(country.toUpperCase())) {
        logger.warn("Access denied by geofencing (country)", { ip: ipRaw, country });
        res
          .status(403)
          .json({
            error: ErrorCodes.ACCESS_DENIED_LOCATION,
            message: "Access from this country is not allowed",
          });
        return;
      }

      // Check allowed IP ranges if configured
      const allowedRanges = cfg.geofencing.allowedIpRanges || [];
      if (allowedRanges.length > 0) {
        let inRange = false;
        for (const r of allowedRanges) {
          try {
            if (cidrContains(r, ipRaw)) {
              inRange = true;
              break;
            }
          } catch (e) {
            // ignore malformed ranges
          }
        }
        if (!inRange) {
          logger.warn("Access denied by geofencing (ip range)", { ip: ipRaw });
          res
            .status(403)
            .json({
              error: ErrorCodes.ACCESS_DENIED_IP,
              message: "Access from this IP is not allowed",
            });
          return;
        }
      }

      next();
    } catch (err) {
      logger.error("GeoFencing error", err as Error);
      next();
    }
  };
}
