/**
 * Minimal IPv4 CIDR matching shared by global geofencing and per-org IP
 * allowlists. IPv6 and malformed entries are treated as non-matching rather
 * than throwing, so a bad rule can never crash a request path.
 */

function ipToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

/** True when `ip` falls inside `cidr` (e.g. "10.0.0.0/8"). Bare IPs match exactly. */
export function cidrContains(cidr: string, ip: string): boolean {
  const [range, bits] = cidr.trim().split("/");
  const ipLong = ipToLong(ip);
  const rangeLong = ipToLong(range);
  if (ipLong === null || rangeLong === null) return false;
  if (bits === undefined) return range === ip;
  const n = Number(bits);
  if (!Number.isInteger(n) || n < 0 || n > 32) return false;
  if (n === 0) return true;
  const mask = (~(2 ** (32 - n) - 1)) >>> 0;
  return (ipLong & mask) === (rangeLong & mask);
}

/** True when `ip` matches any CIDR/IP in the list. Empty list ⇒ no restriction (true). */
export function ipMatchesAny(ip: string, cidrs: string[]): boolean {
  if (!cidrs || cidrs.length === 0) return true;
  if (!ip) return false;
  for (const c of cidrs) {
    if (cidrContains(c, ip)) return true;
  }
  return false;
}

/** Basic shape check for an IPv4 address or CIDR (used to validate admin input). */
export function isValidCidrOrIp(value: string): boolean {
  const [range, bits] = value.trim().split("/");
  if (ipToLong(range) === null) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return Number.isInteger(n) && n >= 0 && n <= 32;
}
