import crypto from "crypto";

/**
 * Generate a cryptographically secure random hex string.
 * @param bytes Number of random bytes to generate (hex output = bytes * 2 chars)
 */
export function generateHexKey(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export interface JwkKeypair {
  publicKey: crypto.JsonWebKey;
  privateKey: crypto.JsonWebKey;
}

/**
 * Generate an ES256 (P-256 ECDSA) JWK keypair suitable for signing JWTs
 * or SSF event tokens.
 */
export async function generateJwkKeypair(): Promise<JwkKeypair> {
  const { privateKey, publicKey } = await crypto.webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const [exportedPrivate, exportedPublic] = await Promise.all([
    crypto.webcrypto.subtle.exportKey("jwk", privateKey),
    crypto.webcrypto.subtle.exportKey("jwk", publicKey),
  ]);

  return { privateKey: exportedPrivate, publicKey: exportedPublic };
}

/**
 * Generate all keys required for a fresh ZeroAuth deployment.
 */
export interface GeneratedKeys {
  TOKEN_SECRET_HEX: string;
  CSFLE_MASTER_KEY_HEX: string;
  SSF_SIGNING_SECRET: string;
}

export function generateAllKeys(): GeneratedKeys {
  return {
    TOKEN_SECRET_HEX: generateHexKey(32),
    CSFLE_MASTER_KEY_HEX: generateHexKey(32),
    SSF_SIGNING_SECRET: generateHexKey(32),
  };
}
