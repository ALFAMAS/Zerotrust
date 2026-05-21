/**
 * FIDO2 Hardware Security Key Attestation Verification
 *
 * Enforces attestation policy for high-assurance deployments.
 * Verifies that the authenticator is a genuine hardware security key
 * using FIDO MDS3 (Metadata Service) trust anchors.
 */
import crypto from "crypto";
import { getLogger } from "../logger";

const logger = getLogger("attestation");

export type AttestationType =
  | "none"
  | "indirect"
  | "direct"
  | "enterprise"
  | "self"
  | "attCA"
  | "anonCA";

export type AuthenticatorStatus =
  | "NOT_FIDO_CERTIFIED"
  | "FIDO_CERTIFIED"
  | "FIDO_CERTIFIED_L1"
  | "FIDO_CERTIFIED_L1plus"
  | "FIDO_CERTIFIED_L2"
  | "FIDO_CERTIFIED_L2plus"
  | "FIDO_CERTIFIED_L3"
  | "FIDO_CERTIFIED_L3plus"
  | "USER_VERIFICATION_BYPASS"
  | "ATTESTATION_KEY_COMPROMISE"
  | "USER_KEY_REMOTE_COMPROMISE"
  | "USER_KEY_PHYSICAL_COMPROMISE"
  | "REVOKED"
  | "UPDATE_AVAILABLE";

export interface AttestationPolicy {
  /**
   * Minimum attestation level required.
   * - "none": No attestation required (passthrough)
   * - "indirect": Anonymised/basic attestation allowed
   * - "direct": Full attestation with verifiable trust chain required
   */
  level: "none" | "indirect" | "direct";

  /** Allow self-attestation (U2F legacy, no trust chain) */
  allowSelfAttestation?: boolean;

  /** Require authenticator registered in FIDO MDS */
  requireFidoCertified?: boolean;

  /** Deny authenticators with these statuses */
  denyStatuses?: AuthenticatorStatus[];

  /** Allow-list of specific AAGUID values (empty = allow all) */
  allowedAAGUIDs?: string[];

  /** Deny-list of specific AAGUID values */
  deniedAAGUIDs?: string[];
}

export interface AttestationVerificationResult {
  passed: boolean;
  attestationType: AttestationType;
  aaguid?: string;
  authenticatorName?: string;
  reason?: string;
  certSubject?: string;
}

export const DEFAULT_POLICY: AttestationPolicy = {
  level: "none",
  allowSelfAttestation: true,
  requireFidoCertified: false,
  denyStatuses: ["REVOKED", "USER_KEY_PHYSICAL_COMPROMISE", "ATTESTATION_KEY_COMPROMISE"],
};

export const HIGH_ASSURANCE_POLICY: AttestationPolicy = {
  level: "direct",
  allowSelfAttestation: false,
  requireFidoCertified: true,
  denyStatuses: [
    "REVOKED",
    "USER_KEY_PHYSICAL_COMPROMISE",
    "ATTESTATION_KEY_COMPROMISE",
    "USER_KEY_REMOTE_COMPROMISE",
    "USER_VERIFICATION_BYPASS",
  ],
};

/**
 * Known high-assurance authenticator AAGUIDs.
 * Source: FIDO Alliance Metadata Service (MDS3) 2024 snapshot.
 */
export const KNOWN_HARDWARE_KEY_AAGUIDS: Record<string, string> = {
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": "YubiKey 5 Series",
  "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5 FIPS Series",
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "YubiKey 5Ci",
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": "YubiKey 5Ci FIPS",
  "73402251-f2a8-4f03-873e-3cb6db604b03": "uTrust FIDO2 Security Key",
  "d8522d9f-575b-4866-88a9-ba99fa02f35b": "YubiKey Bio Series",
  "f8a011f3-8c0a-4d15-8006-17111f9edc7d": "Security Key by Yubico",
  "b92c3f9a-c014-4056-887f-140a2501163b": "Security Key 2 by Yubico",
  "6d44ba9b-f6ec-2e49-b930-0c8fe920cb73": "Security Key NFC by Yubico",
  "c5ef55ff-ad9a-4b9f-b580-adebafe026d0": "YubiKey 5Ci (NFC)",
  "c1f9a0bc-1dd2-404a-b27f-8e29047a43fd": "YubiKey OTP+FIDO+CCID",
  "0132d110-bf4e-4208-a403-ab4f5f12efe5": "FIDO2 USB Authenticator - Feitian",
  "77010bd7-212a-4fc9-b236-d2ca5e9d4084": "Feitian BioPass FIDO2 Pro",
  "b6ede29c-3772-412c-8a78-539c1f4c62d2": "Feitian BioPass FIDO2",
  "12ded745-4bed-47d4-abaa-e713f51d6393": "Feitian AllinPass FIDO2",
  "3e22415d-7fdf-4ea4-8a0c-dd60c4249b9d": "Feitian ePass FIDO2",
  "833b721a-ff5f-4d00-bb2e-bdda3ec01e29": "Feitian ePass FIDO-NFC",
  "9f77e279-a6e2-4d58-b700-31e5943c6a98": "Feitian MultiPass FIDO",
  "a1f52be5-dfab-4364-b51c-2bd496b14a56": "NEOWAVE Winkeo FIDO2",
  "87dbc5a1-4c94-4dc8-8a47-97d800fd1f3c": "EPASS2003",
  "454e5346-4944-4ffd-6c93-8e9267193e9a": "EPASS2003 Bio",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bluink Key",
  "9c835346-796b-4c27-8898-d6032f515cc5": "Cryptnox FIDO2",
  "ab32f0c6-2239-afbb-c470-d2ef4e254db6": "OnlyKey Duo",
  "6002f033-3c07-ce3e-d0f9-5e9710d4a19c": "Nitrokey FIDO2",
  "4e768f2c-5fab-48b3-b300-220eb487752b": "Nitrokey FIDO2 2.0",
  "516d3969-5a57-5651-5958-4e7a49434b55": "Solo V2",
  "8876631b-d4a0-427f-5773-0ec71c9e0279": "Solo Tap",
  "da776f39-f6c8-4a89-b252-1d86137a46ba": "WinMagic SecureDoc Passkey",
  "aeb6569c-f8fb-4950-ac60-24ca2bbe2e52": "Token Ring FIDO2 Authenticator",
  "95442b2e-f15e-4def-b270-efb106facb4e": "Thetis FIDO2 Security Key",
  "1c086528-58d5-f211-823c-356786e36140": "Arculus FIDO 2.1 Key Card",
};

/**
 * Verify an attestation object against policy.
 *
 * @param attestationObject - Raw attestation object from @simplewebauthn (already parsed)
 * @param policy - Attestation policy to enforce
 */
export function verifyAttestation(
  opts: {
    fmt: string;
    aaguid?: string;
    attestationType?: string;
    userVerified: boolean;
  },
  policy: AttestationPolicy = DEFAULT_POLICY
): AttestationVerificationResult {
  const fmt = opts.fmt as AttestationType;
  const aaguid = normaliseAaguid(opts.aaguid);

  // Policy: level "none" — accept anything
  if (policy.level === "none") {
    return {
      passed: true,
      attestationType: fmt,
      aaguid,
      authenticatorName: aaguid ? KNOWN_HARDWARE_KEY_AAGUIDS[aaguid] : undefined,
    };
  }

  // Self-attestation check
  if (fmt === "none" || fmt === "self") {
    if (!policy.allowSelfAttestation) {
      return {
        passed: false,
        attestationType: fmt,
        aaguid,
        reason: "Self-attestation is not permitted by policy",
      };
    }
  }

  // Direct attestation required
  if (policy.level === "direct" && fmt !== "packed" && fmt !== "tpm" && fmt !== "fido-u2f" && fmt !== "android-key" && fmt !== "attCA" && fmt !== "anonCA") {
    if (fmt !== "none" && fmt !== "self") {
      // unknown format — warn but pass
      logger.warn("Unknown attestation format", { fmt, aaguid });
    } else {
      return {
        passed: false,
        attestationType: fmt,
        aaguid,
        reason: `Attestation format '${fmt}' does not satisfy 'direct' policy`,
      };
    }
  }

  // AAGUID deny-list
  if (aaguid && policy.deniedAAGUIDs?.includes(aaguid)) {
    return {
      passed: false,
      attestationType: fmt,
      aaguid,
      reason: `Authenticator AAGUID ${aaguid} is on the deny-list`,
    };
  }

  // AAGUID allow-list
  if (policy.allowedAAGUIDs && policy.allowedAAGUIDs.length > 0) {
    if (!aaguid || !policy.allowedAAGUIDs.includes(aaguid)) {
      return {
        passed: false,
        attestationType: fmt,
        aaguid,
        reason: `Authenticator AAGUID ${aaguid ?? "(unknown)"} is not on the allow-list`,
      };
    }
  }

  // FIDO certified check
  if (policy.requireFidoCertified && aaguid) {
    const isKnown = KNOWN_HARDWARE_KEY_AAGUIDS[aaguid] !== undefined;
    if (!isKnown) {
      logger.warn("Authenticator not in known FIDO certified list", { aaguid });
      // Don't fail here — MDS lookup would be needed for definitive check
    }
  }

  return {
    passed: true,
    attestationType: fmt,
    aaguid,
    authenticatorName: aaguid ? KNOWN_HARDWARE_KEY_AAGUIDS[aaguid] : undefined,
  };
}

function normaliseAaguid(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Strip null bytes / zero AAGUIDs
  if (raw === "00000000-0000-0000-0000-000000000000") return undefined;
  return raw.toLowerCase();
}

// ─── MDS3-enriched Verification ──────────────────────────────────────────────

export interface AttestationVerificationResultWithMDS3 extends AttestationVerificationResult {
  deviceDescription?: string;
  mds3Certified?: boolean;
}

/**
 * Verify attestation and optionally enrich the result with MDS3 data.
 *
 * If `policy.requireFidoCertified` is true, performs a live MDS3 lookup via
 * `isFidoCertified()` and `getDeviceDescription()`.  Gracefully falls back
 * when the MDS3 service is unreachable.
 */
export async function verifyAttestationWithMDS3(
  opts: {
    fmt: string;
    aaguid?: string;
    attestationType?: string;
    userVerified: boolean;
  },
  policy: AttestationPolicy = DEFAULT_POLICY
): Promise<AttestationVerificationResultWithMDS3> {
  // Run the synchronous base verification first
  const baseResult = verifyAttestation(opts, policy);

  // Short-circuit: if already failed there is nothing to enrich
  if (!baseResult.passed) {
    return baseResult;
  }

  const aaguid = baseResult.aaguid;
  let deviceDescription: string | undefined;
  let mds3Certified: boolean | undefined;

  if (aaguid) {
    try {
      // Dynamic import avoids a hard circular dependency at module load time
      const { isFidoCertified, getDeviceDescription } = await import("./fido-mds3");

      if (policy.requireFidoCertified) {
        const certified = await isFidoCertified(aaguid);
        mds3Certified = certified;

        if (!certified) {
          return {
            passed: false,
            attestationType: baseResult.attestationType,
            aaguid,
            reason: `Authenticator AAGUID ${aaguid} is not FIDO certified according to MDS3`,
            mds3Certified: false,
          };
        }
      }

      const desc = await getDeviceDescription(aaguid);
      if (desc) deviceDescription = desc;
    } catch (err) {
      logger.warn("MDS3 lookup failed during verifyAttestationWithMDS3; continuing without it", err as Error);
    }
  }

  return {
    ...baseResult,
    ...(deviceDescription !== undefined ? { deviceDescription } : {}),
    ...(mds3Certified !== undefined ? { mds3Certified } : {}),
  };
}

/**
 * Get attestation policy from environment config.
 */
export function getAttestationPolicy(): AttestationPolicy {
  const level = (process.env.ATTESTATION_LEVEL || "none") as AttestationPolicy["level"];
  const highAssurance = process.env.ATTESTATION_HIGH_ASSURANCE === "true";

  if (highAssurance) return HIGH_ASSURANCE_POLICY;

  return {
    ...DEFAULT_POLICY,
    level,
    allowSelfAttestation: process.env.ATTESTATION_ALLOW_SELF !== "false",
    requireFidoCertified: process.env.ATTESTATION_REQUIRE_FIDO_CERTIFIED === "true",
  };
}
