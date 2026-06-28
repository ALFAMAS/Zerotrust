/**
 * Shared SSRF guard — prevents server-side request forgery (CWE-918).
 *
 * Any server-side HTTP whose host derives from user input (DID, webhook URL,
 * federation provider config, image proxy, etc.) must go through
 * `fetchPublicUrl()`, which validates the host before issuing the request and
 * always applies `redirect: "error"` + `AbortSignal.timeout(...)`.
 *
 * Fixed SaaS/provider URLs and operator-controlled internal endpoints should use
 * `fetchFixedUrl()` so they still get timeout + no-redirect defaults without the
 * public-host restriction.
 *
 * Canonical reference: see the "Security hardening rules" table in CLAUDE.md.
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
  if (isIP(host) !== 0)
    throw new Error(`SSRF guard: host must be a DNS name, not an IP literal: ${host}`);
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

export type SafeFetchInit = Omit<RequestInit, "redirect"> & {
  /** Per-request timeout. Defaults to 5s. */
  timeoutMs?: number;
};

const DEFAULT_FETCH_TIMEOUT_MS = 5000;

function timeoutSignal(timeoutMs: number, callerSignal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeout;
  return AbortSignal.any([callerSignal, timeout]);
}

function withSafeFetchDefaults(init: SafeFetchInit = {}): RequestInit {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = init;
  return {
    ...rest,
    signal: timeoutSignal(timeoutMs, signal),
    redirect: "error",
  };
}

/**
 * Fetch a fixed/provider/operator-controlled URL with mandatory server-side HTTP
 * safety defaults. This intentionally does NOT apply the public-host SSRF guard,
 * because internal Elasticsearch/SIEM/rate-service endpoints are legitimate when
 * they come from trusted operator config.
 */
export function fetchFixedUrl(input: RequestInfo | URL, init?: SafeFetchInit): Promise<Response> {
  return fetch(input, withSafeFetchDefaults(init));
}

/**
 * Fetch a tenant/admin/user-influenced public URL. Applies the canonical CWE-918
 * SSRF guard before network I/O and also refuses redirects + enforces timeout.
 */
export async function fetchPublicUrl(input: string | URL, init?: SafeFetchInit): Promise<Response> {
  const url = input instanceof URL ? input.toString() : input;
  // `async` so a guard failure surfaces as a promise rejection (callers may use
  // `.catch()`), never a synchronous throw from a Promise-returning function.
  assertSafeFetchUrl(url);
  return fetchFixedUrl(url, init);
}
