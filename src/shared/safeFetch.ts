/**
 * Shared SSRF guard — prevents server-side request forgery (CWE-918).
 *
 * Any server-side `fetch`/HTTP whose host derives from user input (DID, webhook
 * URL, federation provider config, image proxy, etc.) must call
 * `assertSafeFetchHost` on the hostname before issuing the request, and must use
 * `redirect: "error"` + `AbortSignal.timeout(...)` on the fetch itself.
 *
 * Canonical reference: originally extracted from `src/did/resolver.ts`; see the
 * "Security hardening rules" table in CLAUDE.md.
 */
import { isIP } from "node:net";

/**
 * Reject hosts that would let a caller drive server-side requests at private
 * infrastructure (SSRF). Blocks:
 *  - empty hosts
 *  - hosts with a port (non-default port injection)
 *  - raw IP literals (blocks 169.254.169.254, 127.0.0.1, 10.x, 192.168.x, etc.)
 *  - obvious internal/loopback hostnames (localhost, .localhost, .local,
 *    metadata.google.internal)
 *
 * Synchronous guard is intentionally cheap; DNS-rebinding mitigation would
 * require pinning the resolved IP for the fetch. dns.lookup is async-only, so
 * callers that need full rebinding protection should resolve once and fetch by
 * IP with a Host header. The checks above cover the common SSRF vectors.
 */
export function assertSafeFetchHost(host: string): void {
  if (!host) throw new Error("SSRF guard: empty host");
  if (host.includes(":")) throw new Error(`SSRF guard: host must not specify a port: ${host}`);
  // Block raw IP literals — only DNS names are permitted.
  if (isIP(host) !== 0) throw new Error(`SSRF guard: host must be a DNS name, not an IP literal: ${host}`);
  // Block obvious internal/loopback hostnames without needing DNS.
  const lower = host.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower === "metadata.google.internal"
  ) {
    throw new Error(`SSRF guard: host not allowed: ${host}`);
  }
}

/**
 * Extract the hostname from a URL string and validate it against the SSRF guard.
 * Throws if the host is unsafe. Returns the parsed URL for convenience.
 */
export function assertSafeFetchUrl(url: string): URL {
  const parsed = new URL(url);
  assertSafeFetchHost(parsed.hostname);
  if (parsed.port && parsed.port !== "443" && parsed.port !== "80") {
    throw new Error(`SSRF guard: non-default port not allowed: ${parsed.port}`);
  }
  return parsed;
}
