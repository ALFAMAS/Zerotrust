/**
 * Credential-stuffing defense.
 *
 * Account lockout (accountLockout.ts) protects a *single* account from brute
 * force. Credential stuffing is the opposite shape: one source IP trying a few
 * passwords across *many* stolen accounts, staying under any per-account limit.
 *
 * This tracks login failures per source IP in a sliding window and blocks the IP
 * when it crosses either a raw failure-velocity threshold or a "distinct accounts
 * targeted" threshold (the strongest stuffing signal). In-memory and bounded —
 * a swept Map keyed by IP, mirroring accountLockout's approach.
 */
import { getLogger } from "../logger";

const logger = getLogger("credential-stuffing");

const WINDOW_MS = parseInt(process.env.CRED_STUFF_WINDOW_MS || String(15 * 60 * 1000));
const MAX_FAILURES = parseInt(process.env.CRED_STUFF_MAX_FAILURES || "20");
const MAX_DISTINCT_ACCOUNTS = parseInt(process.env.CRED_STUFF_MAX_ACCOUNTS || "10");
const BLOCK_MS = parseInt(process.env.CRED_STUFF_BLOCK_MS || String(30 * 60 * 1000));

interface IpRecord {
  failures: number;
  accounts: Set<string>;
  windowStart: number;
  blockedUntil?: number;
}

const byIp = new Map<string, IpRecord>();

// Periodic sweep so idle IPs don't accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of byIp.entries()) {
    const expired = now - rec.windowStart > WINDOW_MS;
    const unblocked = !rec.blockedUntil || rec.blockedUntil < now;
    if (expired && unblocked) byIp.delete(ip);
  }
}, 5 * 60 * 1000).unref();

/** True (with retry hint) when the IP is currently blocked for stuffing. */
export function isIpBlocked(ip: string): { blocked: boolean; retryAfterSecs?: number } {
  if (!ip) return { blocked: false };
  const rec = byIp.get(ip);
  if (!rec?.blockedUntil) return { blocked: false };
  const now = Date.now();
  if (rec.blockedUntil > now) {
    return { blocked: true, retryAfterSecs: Math.ceil((rec.blockedUntil - now) / 1000) };
  }
  // Block expired — reset the window.
  byIp.delete(ip);
  return { blocked: false };
}

/**
 * Record a failed login from `ip` against `email`. Blocks the IP once it exceeds
 * the failure-velocity OR distinct-accounts threshold inside the window.
 */
export function recordIpLoginFailure(ip: string, email?: string): void {
  if (!ip) return;
  const now = Date.now();
  let rec = byIp.get(ip);

  if (!rec || now - rec.windowStart > WINDOW_MS) {
    rec = { failures: 0, accounts: new Set(), windowStart: now };
  }

  rec.failures += 1;
  if (email) rec.accounts.add(email.toLowerCase());

  if (rec.failures >= MAX_FAILURES || rec.accounts.size >= MAX_DISTINCT_ACCOUNTS) {
    rec.blockedUntil = now + BLOCK_MS;
    logger.warn("IP blocked for credential stuffing", {
      ip,
      failures: rec.failures,
      distinctAccounts: rec.accounts.size,
    });
  }

  byIp.set(ip, rec);
}

/**
 * A successful login is a weak "not stuffing" signal, but stuffing campaigns do
 * land hits — so we only clear an IP that isn't already blocked, and never lift
 * an active block.
 */
export function recordIpLoginSuccess(ip: string): void {
  if (!ip) return;
  const rec = byIp.get(ip);
  if (rec && !rec.blockedUntil) byIp.delete(ip);
}

/** Test/maintenance helper. */
export function clearCredentialStuffing(ip?: string): void {
  if (ip) byIp.delete(ip);
  else byIp.clear();
}
