import geoip from "geoip-lite";
import type { Context } from "hono";
import { getClientIp } from "./clientIp";

/** ISO 3166-1 alpha-2 country code from the client IP, or empty when unknown. */
export function inferClientCountry(c: Context): string {
  const ip = getClientIp(c);
  if (!ip) return "";
  const geo = geoip.lookup(ip);
  return geo?.country ?? "";
}
