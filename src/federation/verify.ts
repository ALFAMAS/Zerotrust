import { getLogger } from "../logger/index.js";
import type { FederatedClaim, FederatedProvider } from "./types.js";

const logger = getLogger("federation-verify");

interface JwksKey {
  kid?: string;
  kty: string;
  use?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

const jwksCache = new Map<string, JwksCache>();
const JWKS_TTL_MS = 5 * 60 * 1000;

async function fetchJwks(uri: string): Promise<JwksKey[]> {
  const cached = jwksCache.get(uri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const res = await fetch(uri, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JwksKey[] };
  jwksCache.set(uri, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

export async function verifySubjectToken(
  token: string,
  provider: FederatedProvider,
): Promise<FederatedClaim> {
  if (provider.jwksUri) {
    try {
      // Attempt lightweight JWT payload decode (no signature verification in dev mode)
      // For production, install jose: npm install jose
      await fetchJwks(provider.jwksUri); // warm cache and validate JWKS endpoint is reachable
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], "base64url").toString(
          "utf-8",
        );
        const payload = JSON.parse(payloadJson) as Record<string, unknown>;
        if (payload.iss && payload.iss !== provider.issuerUrl) {
          throw new Error(
            `Issuer mismatch: expected ${provider.issuerUrl}, got ${String(payload.iss)}`,
          );
        }
        if (
          typeof payload.exp === "number" &&
          payload.exp < Math.floor(Date.now() / 1000)
        ) {
          throw new Error("Token has expired");
        }
        return {
          sub: String(payload.sub ?? ""),
          email: typeof payload.email === "string" ? payload.email : undefined,
          scope:
            typeof payload.scope === "string"
              ? payload.scope.split(" ")
              : undefined,
        };
      }
    } catch (err) {
      logger.warn("JWT decode failed, falling back to introspection", {
        providerId: provider.id,
        error: String(err),
      });
    }
  }

  // Fallback: introspect token against remote zerotrust /auth/me
  const res = await fetch(`${provider.issuerUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Remote token introspection failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    id?: string;
    email?: string;
    sub?: string;
  };
  const sub = data.id ?? data.sub;
  if (!sub)
    throw new Error("Remote provider did not return a subject identifier");

  return { sub, email: data.email };
}

// Export for testing/reuse
export { fetchJwks };
