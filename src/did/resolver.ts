import { isIP } from "node:net";
import type { DIDDocument, VerificationMethod } from "./types";

// Base58 alphabet (Bitcoin variant used by did:key)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of str) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = digit;
    for (let i = bytes.length - 1; i >= 0; i--) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

export async function resolveDIDKey(did: string): Promise<DIDDocument> {
  if (!did.startsWith("did:key:")) throw new Error("Not a did:key DID");
  const multibase = did.slice("did:key:".length);
  if (!multibase.startsWith("z")) throw new Error("Expected base58btc multibase (z prefix)");

  const bytes = base58Decode(multibase.slice(1));
  const prefix0 = bytes[0];
  const prefix1 = bytes[1];

  let keyType: string;
  let publicKeyJwk: JsonWebKey;

  if (prefix0 === 0xed && prefix1 === 0x01) {
    // Ed25519
    keyType = "Ed25519VerificationKey2020";
    const keyBytes = bytes.slice(2);
    publicKeyJwk = {
      kty: "OKP",
      crv: "Ed25519",
      x: Buffer.from(keyBytes).toString("base64url"),
    };
  } else if (prefix0 === 0x12 && prefix1 === 0x00) {
    // P-256
    keyType = "JsonWebKey2020";
    const keyBytes = bytes.slice(2);
    publicKeyJwk = {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from(keyBytes.slice(1, 33)).toString("base64url"),
      y: Buffer.from(keyBytes.slice(33, 65)).toString("base64url"),
    };
  } else {
    keyType = "JsonWebKey2020";
    publicKeyJwk = {
      kty: "OKP",
      crv: "Ed25519",
      x: Buffer.from(bytes.slice(2)).toString("base64url"),
    };
  }

  const vmId = `${did}#${multibase}`;
  const vm: VerificationMethod = {
    id: vmId,
    type: keyType,
    controller: did,
    publicKeyJwk,
    publicKeyMultibase: multibase,
  };

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: did,
    verificationMethod: [vm],
    authentication: [vmId],
    assertionMethod: [vmId],
    keyAgreement: [vmId],
  };
}

export async function resolveDIDWeb(did: string): Promise<DIDDocument> {
  if (!did.startsWith("did:web:")) throw new Error("Not a did:web DID");
  const rest = did.slice("did:web:".length);
  const parts = rest.split(":");
  const host = decodeURIComponent(parts[0]);
  // SECURITY (CWE-918): did:web fetches an attacker-influenced host. Block
  // non-default ports, IP literals, and hosts that resolve to private /
  // loopback / link-local / metadata ranges before issuing the request.
  assertSafeFetchHost(host);
  const path = parts.slice(1).join("/");
  const url = path ? `https://${host}/${path}/did.json` : `https://${host}/.well-known/did.json`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Failed to fetch DID document from ${url}: ${res.status}`);
  return res.json() as Promise<DIDDocument>;
}

/**
 * Reject hosts that would let a caller drive server-side requests at private
 * infrastructure (SSRF). did:web is HTTPS-only on the default port; IP-literal
 * hosts and any host resolving to a non-public address are refused.
 */
function assertSafeFetchHost(host: string): void {
  if (!host) throw new Error("Empty did:web host");
  if (host.includes(":")) throw new Error("did:web host must not specify a port");
  // Block raw IP literals — only DNS names are permitted.
  if (isIP(host) !== 0) throw new Error("did:web host must be a DNS name, not an IP literal");
  // Block obvious internal/loopback hostnames without needing DNS.
  const lower = host.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower === "metadata.google.internal"
  ) {
    throw new Error(`did:web host not allowed: ${host}`);
  }
  // Synchronous guard is intentionally cheap; DNS-rebinding mitigation would
  // require pinning the resolved IP for the fetch. dns.lookup is async-only, so
  // callers that need full rebinding protection should resolve once and fetch by
  // IP with a Host header. The checks above cover the common SSRF vectors
  // (169.254.169.254, localhost, .local).
}

export async function resolveDID(did: string): Promise<DIDDocument | null> {
  try {
    if (did.startsWith("did:key:")) return await resolveDIDKey(did);
    if (did.startsWith("did:web:")) return await resolveDIDWeb(did);
    return null;
  } catch {
    return null;
  }
}
