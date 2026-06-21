/**
 * Attestation CA Pinning
 *
 * Allows deployments to restrict which Certification Authorities are
 * trusted during attestation verification, preventing credential
 * registration from authenticators issued by unexpected CAs.
 */

import crypto from "node:crypto";
import { getLogger } from "../logger";

const logger = getLogger("attestation-ca-pin");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttestationCAPin {
  /**
   * Hex-encoded SHA-256 digest of the CA's Subject Public Key Info (SPKI).
   * Used as the primary pin identifier.
   */
  caSubjectKeyId: string;

  /**
   * Human-readable Common Name of the CA certificate, used for logging
   * and as a fallback matching mechanism.
   */
  caCommonName: string;

  /**
   * Logical deployment identifier that this pin belongs to.
   * Pins are scoped per deployment.
   */
  deploymentId: string;

  /**
   * Optional list of AAGUIDs that are permitted under this CA pin.
   * If omitted, all AAGUIDs issued by this CA are permitted.
   */
  allowedAAGUIDs?: string[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

/** In-memory store: deploymentId → list of CA pins */
const pinStore = new Map<string, AttestationCAPin[]>();

// ─── Store Management ─────────────────────────────────────────────────────────

/**
 * Register a CA pin for a deployment.
 * Multiple pins per deployment are supported (CA rotation).
 */
export function pinAttestationCA(pin: AttestationCAPin): void {
  const existing = pinStore.get(pin.deploymentId) ?? [];
  // Avoid duplicate pins (same caSubjectKeyId for same deployment)
  if (!existing.some((p) => p.caSubjectKeyId === pin.caSubjectKeyId)) {
    existing.push(pin);
    pinStore.set(pin.deploymentId, existing);
    logger.info("CA pin registered", {
      deploymentId: pin.deploymentId,
      caCommonName: pin.caCommonName,
      caSubjectKeyId: pin.caSubjectKeyId,
    });
  }
}

/**
 * Remove all CA pins for a deployment.
 */
export function unpinAttestationCA(deploymentId: string): void {
  const existed = pinStore.delete(deploymentId);
  if (existed) {
    logger.info("CA pins removed", { deploymentId });
  }
}

/**
 * Return all currently registered CA pins across all deployments.
 */
export function getAttestationCAPins(): AttestationCAPin[] {
  const all: AttestationCAPin[] = [];
  for (const pins of pinStore.values()) {
    all.push(...pins);
  }
  return all;
}

// ─── Certificate Helpers ──────────────────────────────────────────────────────

/**
 * Extract the Common Name from a PEM certificate's Subject or Issuer line.
 *
 * This is a lightweight regex-based parser; it does not perform full
 * ASN.1 decoding. For production deployments, use a proper X.509 library.
 *
 * Matches patterns such as:
 *   subject=CN=My Root CA, O=Acme Corp
 *   Subject: CN=My Root CA
 *   CN=Some CA
 */
function extractCommonNameFromPem(pem: string): string | null {
  const cnPattern = /CN\s*=\s*([^,\n\r/]+)/i;
  const match = pem.match(cnPattern);
  return match ? match[1].trim() : null;
}

/**
 * Compute a simplified Subject Key Identifier from a PEM certificate.
 *
 * Since we don't have a full ASN.1 parser available, we hash the entire
 * DER-encoded certificate body (between PEM headers) with SHA-256 and use
 * that as a stable, reproducible pin identifier.
 *
 * NOTE: The FIDO spec uses the actual SubjectPublicKeyInfo hash. If you
 * integrate a proper X.509 library (e.g. `@peculiar/x509`), replace this
 * implementation with a real SPKI hash.
 */
function computeCertificatePin(pem: string): string | null {
  try {
    const lines = pem.split(/\r?\n/).filter(Boolean);
    // Strip PEM headers/footers and join the base64 body
    const b64 = lines.filter((l) => !l.startsWith("-----")).join("");

    if (!b64) return null;

    const der = Buffer.from(b64, "base64");
    return crypto.createHash("sha256").update(der).digest("hex");
  } catch {
    return null;
  }
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Check whether the attesting certificate satisfies the CA pins registered
 * for the given deployment.
 *
 * Policy semantics:
 * - If no pins are configured for the deployment → allow (open policy).
 * - If pins are configured:
 *   - Self-attestation (`attestationCert === null`) is rejected.
 *   - The certificate pin must match at least one registered pin.
 *   - If the matched pin has `allowedAAGUIDs`, the presenting AAGUID must
 *     be in that list.
 *
 * @param aaguid          - The AAGUID of the authenticator being registered.
 * @param attestationCert - PEM-encoded attestation certificate, or `null` for
 *                          self/none attestation.
 * @param deploymentId    - Deployment scope for the lookup. If omitted, only
 *                          pins registered without a deploymentId are checked
 *                          (in practice you should always pass a deploymentId).
 */
export function verifyAttestationCAPin(
  aaguid: string,
  attestationCert: string | null,
  deploymentId?: string
): boolean {
  const scopeId = deploymentId ?? "";
  const pins = pinStore.get(scopeId);

  // No pins registered for this deployment → unrestricted
  if (!pins || pins.length === 0) {
    return true;
  }

  // Strict mode: self-attestation is rejected when pins are configured
  if (attestationCert === null) {
    logger.warn("CA pin check: self-attestation rejected (pins configured)", {
      deploymentId: scopeId,
    });
    return false;
  }

  const certPin = computeCertificatePin(attestationCert);
  const certCN = extractCommonNameFromPem(attestationCert);
  const normalAaguid = aaguid.toLowerCase();

  for (const pin of pins) {
    // Match by Subject Key ID hash (primary)
    const skidMatch = certPin !== null && certPin === pin.caSubjectKeyId;

    // Fallback: match by Common Name if SKID comparison failed
    const cnMatch = certCN !== null && certCN === pin.caCommonName;

    if (skidMatch || cnMatch) {
      // Check optional AAGUID allow-list
      if (pin.allowedAAGUIDs && pin.allowedAAGUIDs.length > 0) {
        if (!pin.allowedAAGUIDs.map((a) => a.toLowerCase()).includes(normalAaguid)) {
          logger.warn("CA pin match but AAGUID not in allow-list", {
            aaguid: normalAaguid,
            caCommonName: pin.caCommonName,
          });
          return false;
        }
      }
      return true;
    }
  }

  logger.warn("CA pin check failed: no matching CA pin found", {
    deploymentId: scopeId,
    certCN,
    aaguid: normalAaguid,
  });
  return false;
}
