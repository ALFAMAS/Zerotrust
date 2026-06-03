import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
const geoip = require("geoip-lite") as { lookup(ip: string): { country?: string } | null };
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";

const logger = getLogger("geo-fencing");

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function cidrContains(cidr: string, ip: string): boolean {
  const [range, bits] = cidr.split("/");
  if (!bits) return range === ip;
  const mask = ~(2 ** (32 - Number(bits)) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

export function geoFencingMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    try {
      const cfg = getConfig();
      if (!cfg.geofencing.enabled) return next();

      const ipRaw = (
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        c.req.header("x-real-ip") ||
        ""
      );
      if (!ipRaw) return next();

      const geo = geoip.lookup(ipRaw);
      const country = geo?.country || "";

      c.set("inferredCountry", country);

      const user = c.get("user");
      const allowedGlobal = cfg.geofencing.allowedCountries.map((c) => c.trim().toUpperCase());
      const allowedUser = (user as any)?.sessionConfig?.allowedCountries || [];
      const allowed = new Set([
        ...allowedGlobal,
        ...allowedUser.map((c: string) => c.toUpperCase()),
      ]);

      if (allowed.size > 0 && !allowed.has(country.toUpperCase())) {
        logger.warn("Access denied by geofencing (country)", { ip: ipRaw, country });
        return c.json(
          { error: ErrorCodes.ACCESS_DENIED_LOCATION, message: "Access from this country is not allowed" },
          403
        );
      }

      const allowedRanges = cfg.geofencing.allowedIpRanges || [];
      if (allowedRanges.length > 0) {
        let inRange = false;
        for (const r of allowedRanges) {
          try {
            if (cidrContains(r, ipRaw)) { inRange = true; break; }
          } catch {}
        }
        if (!inRange) {
          logger.warn("Access denied by geofencing (ip range)", { ip: ipRaw });
          return c.json(
            { error: ErrorCodes.ACCESS_DENIED_IP, message: "Access from this IP is not allowed" },
            403
          );
        }
      }

      return next();
    } catch (err) {
      logger.error("GeoFencing error", err as Error);
      return next();
    }
  });
}
