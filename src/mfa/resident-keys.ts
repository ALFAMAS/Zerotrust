/**
 * FIDO2 Resident Keys / Discoverable Credentials
 *
 * Provides helpers for registering and authenticating with discoverable
 * (resident-key) credentials.  With discoverable credentials the user does
 * not need to provide a username before authenticating — the authenticator
 * stores the credential internally and returns the userId in the assertion.
 *
 * Uses @simplewebauthn/server under the hood.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoverableAuthenticator {
  credentialID: string;
  credentialPublicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Generate WebAuthn registration options that require a resident (discoverable)
 * key.  The authenticator will store the credential on-device, enabling
 * usernameless authentication flows.
 *
 * @param userId              - Opaque user identifier (stored in the credential)
 * @param userName            - Human-readable username (e.g. email address)
 * @param existingCredentials - Base64url-encoded credential IDs already
 *                              registered for this user, used to build the
 *                              `excludeCredentials` list.
 */
export async function generateDiscoverableRegistrationOptions(
  userId: string,
  userName: string,
  existingCredentials: string[]
): Promise<ReturnType<typeof generateRegistrationOptions> extends Promise<infer T> ? T : never> {
  const opts: GenerateRegistrationOptionsOpts = {
    rpName: process.env.RP_NAME || "ZeroAuth",
    rpID: process.env.RP_ID || "localhost",
    userName,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existingCredentials.map((id) => ({
      id,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
      requireResidentKey: true,
    },
  };

  return generateRegistrationOptions(opts);
}

/**
 * Verify the registration response for a discoverable credential.
 *
 * @param response         - The raw credential creation response from the client
 * @param expectedChallenge - The challenge that was sent to the client
 * @param expectedOrigin   - The expected origin (e.g. "https://app.example.com")
 * @param expectedRPID     - The expected RP ID (e.g. "example.com")
 */
export async function verifyDiscoverableRegistration(
  response: VerifyRegistrationResponseOpts["response"],
  expectedChallenge: string,
  expectedOrigin: string,
  expectedRPID: string
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
  });
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Generate WebAuthn authentication options for a discoverable credential flow.
 *
 * The `allowCredentials` list is intentionally left empty so that the
 * authenticator presents any stored credential for the given RP to the user,
 * without requiring the application to know the user's identity up-front.
 *
 * @param rpId - The Relying Party identifier (e.g. "example.com")
 */
export async function generateDiscoverableAuthenticationOptions(
  rpId: string
): Promise<ReturnType<typeof generateAuthenticationOptions> extends Promise<infer T> ? T : never> {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: rpId,
    // Empty allowCredentials triggers the discoverable / usernameless flow
    allowCredentials: [],
    userVerification: "required",
  };

  return generateAuthenticationOptions(opts);
}

/**
 * Verify the authentication assertion for a discoverable credential.
 *
 * @param response          - The raw credential assertion response from the client
 * @param expectedChallenge - The challenge that was sent to the client
 * @param expectedOrigin    - The expected origin (e.g. "https://app.example.com")
 * @param expectedRPID      - The expected RP ID (e.g. "example.com")
 * @param authenticator     - The stored authenticator record for the credential
 */
export async function verifyDiscoverableAuthentication(
  response: VerifyAuthenticationResponseOpts["response"],
  expectedChallenge: string,
  expectedOrigin: string,
  expectedRPID: string,
  authenticator: DiscoverableAuthenticator
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    credential: {
      id: Buffer.from(authenticator.credentialID).toString("base64url"),
      publicKey: authenticator.credentialPublicKey as unknown as Uint8Array<ArrayBuffer>,
      counter: authenticator.counter,
      transports: authenticator.transports,
    },
  });
}
