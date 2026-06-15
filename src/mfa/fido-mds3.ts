/**
 * FIDO Alliance MDS3 (Metadata Service 3) Integration
 *
 * Provides device certification lookup against the FIDO Alliance
 * Metadata Service 3 (https://mds3.fidoalliance.org/).
 *
 * The MDS3 TOC is a JWT-signed blob. The TOC signature is verified against
 * the certificate chain embedded in the JWT `x5c` header: chain linkage and
 * certificate validity are checked, the leaf signs the token, and — when
 * `FIDO_MDS3_ROOT_CERT` is configured — the chain is pinned to the FIDO
 * Alliance root CA. Set `FIDO_MDS3_ALLOW_UNSIGNED=true` only for offline tests.
 */

import { X509Certificate, createVerify, constants } from "crypto";
import { getLogger } from "../logger";

const logger = getLogger("fido-mds3");

const MDS3_TOC_URL = "https://mds3.fidoalliance.org/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export type MDS3AuthenticatorStatus =
  | "FIDO_CERTIFIED"
  | "FIDO_CERTIFIED_L1"
  | "FIDO_CERTIFIED_L2"
  | "FIDO_CERTIFIED_L3"
  | "NOT_FIDO_CERTIFIED"
  | "USER_VERIFICATION_BYPASS"
  | "ATTESTATION_KEY_COMPROMISE"
  | "USER_KEY_REMOTE_COMPROMISE"
  | "USER_KEY_PHYSICAL_COMPROMISE"
  | "REVOKED";

export interface MDS3StatusReport {
  status: MDS3AuthenticatorStatus;
  effectiveDate?: string;
  authenticatorVersion?: number;
  url?: string;
  certificationDescriptor?: string;
  certificateNumber?: string;
  certificationPolicyVersion?: string;
  certificationRequirementsVersion?: string;
}

export interface MDS3Entry {
  aaguid: string;
  url?: string;
  statusReports: MDS3StatusReport[];
  timeOfLastStatusChange: string;
  // Metadata statement fields (populated after individual entry fetch)
  description?: string;
  authenticatorVersion?: number;
  protocolFamily?: string;
}

export interface MDS3Cache {
  entries: Map<string, MDS3Entry>;
  fetchedAt: number;
  nextUpdate?: string;
  legalHeader?: string;
}

// ─── Module State ─────────────────────────────────────────────────────────────

let cache: MDS3Cache | null = null;
let initApiKey: string | undefined;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Base64url decode to a UTF-8 string (works in Node.js 18+).
 */
function base64urlDecode(input: string): string {
  // Pad and convert base64url -> base64
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padding);
  return Buffer.from(base64, "base64").toString("utf8");
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64");
}

/**
 * Verify the MDS3 TOC JWT signature against its embedded x5c certificate chain.
 * Throws if the token is unsigned, the chain is broken/expired, the configured
 * FIDO root pin does not match, or the leaf signature is invalid.
 */
function verifyTocSignature(jwtString: string): void {
  const parts = jwtString.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("MDS3 JWT rejected: expected a 3-part signed token");
  }

  const header = JSON.parse(base64urlDecode(parts[0])) as { alg?: string; x5c?: string[] };
  const alg = header.alg;
  if (!alg || alg === "none") {
    throw new Error("MDS3 JWT rejected: missing or 'none' algorithm");
  }

  if (!header.x5c || header.x5c.length === 0) {
    if (process.env.FIDO_MDS3_ALLOW_UNSIGNED === "true") {
      logger.warn("MDS3 TOC has no x5c chain — skipping verification (FIDO_MDS3_ALLOW_UNSIGNED=true)");
      return;
    }
    throw new Error("MDS3 JWT rejected: no x5c certificate chain to verify against");
  }

  const chain = header.x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));

  // 1. Validity window of every certificate in the chain.
  const now = Date.now();
  for (const cert of chain) {
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
      throw new Error("MDS3 JWT rejected: a certificate in the chain is expired or not yet valid");
    }
  }

  // 2. Chain linkage: each cert must be signed by the next one up.
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].verify(chain[i + 1].publicKey)) {
      throw new Error("MDS3 JWT rejected: broken certificate chain");
    }
  }

  // 3. Root trust: pin to the configured FIDO Alliance root CA when available.
  const rootPem = process.env.FIDO_MDS3_ROOT_CERT;
  if (rootPem) {
    const root = new X509Certificate(rootPem);
    const top = chain[chain.length - 1];
    if (top.fingerprint256 !== root.fingerprint256 && !top.verify(root.publicKey)) {
      throw new Error("MDS3 JWT rejected: chain does not terminate at the configured FIDO root CA");
    }
  } else {
    logger.warn(
      "FIDO_MDS3_ROOT_CERT not set — TOC signature + chain are verified, but not pinned to the FIDO root CA"
    );
  }

  // 4. The leaf certificate must have signed the JWT.
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = base64urlToBuffer(parts[2]);
  const leafKey = chain[0].publicKey;

  let ok = false;
  if (alg === "RS256") {
    ok = createVerify("RSA-SHA256").update(signingInput).verify(leafKey, signature);
  } else if (alg === "PS256") {
    ok = createVerify("RSA-SHA256")
      .update(signingInput)
      .verify(
        {
          key: leafKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
        },
        signature
      );
  } else if (alg === "ES256") {
    ok = createVerify("SHA256")
      .update(signingInput)
      .verify({ key: leafKey, dsaEncoding: "ieee-p1363" }, signature);
  } else {
    throw new Error(`MDS3 JWT rejected: unsupported signature algorithm ${alg}`);
  }

  if (!ok) throw new Error("MDS3 JWT rejected: signature verification failed");
}

function isCacheFresh(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

/**
 * Parse a raw MDS3 TOC JWT payload into a MDS3Cache object.
 * The TOC payload contains:
 *   { legalHeader, nextUpdate, no, entries: [ {aaguid, url, statusReports, timeOfLastStatusChange} ] }
 */
function parseTocJwt(jwtString: string): MDS3Cache {
  const parts = jwtString.trim().split(".");
  if (parts.length < 2) {
    throw new Error("Invalid MDS3 JWT: expected at least 2 parts");
  }

  // Authenticate the TOC before trusting any entry inside it.
  verifyTocSignature(jwtString);

  const payloadJson = base64urlDecode(parts[1]);
  const payload = JSON.parse(payloadJson) as {
    legalHeader?: string;
    nextUpdate?: string;
    no?: number;
    entries?: Array<{
      aaguid?: string;
      url?: string;
      statusReports?: MDS3StatusReport[];
      timeOfLastStatusChange?: string;
    }>;
  };

  const entries = new Map<string, MDS3Entry>();

  for (const raw of payload.entries ?? []) {
    if (!raw.aaguid) continue;
    const aaguid = raw.aaguid.toLowerCase();
    entries.set(aaguid, {
      aaguid,
      url: raw.url,
      statusReports: raw.statusReports ?? [],
      timeOfLastStatusChange: raw.timeOfLastStatusChange ?? "",
    });
  }

  return {
    entries,
    fetchedAt: Date.now(),
    nextUpdate: payload.nextUpdate,
    legalHeader: payload.legalHeader,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the MDS3 module and pre-fetch the TOC.
 *
 * @param apiKey - Optional API key (some MDS3 endpoints require it in the
 *                 Authorization header or as a query parameter).
 */
export async function initMDS3(apiKey?: string): Promise<void> {
  initApiKey = apiKey;
  try {
    await refreshToc();
    logger.info("MDS3 TOC initialized", { entryCount: cache?.entries.size ?? 0 });
  } catch (err) {
    logger.warn("MDS3 TOC initial fetch failed; will retry on next lookup", { error: String(err) });
  }
}

/**
 * Fetch/refresh the MDS3 TOC and store it in the in-memory cache.
 */
async function refreshToc(): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/jwt, application/json",
  };
  if (initApiKey) {
    headers["Authorization"] = `Bearer ${initApiKey}`;
  }

  const response = await fetch(MDS3_TOC_URL, { headers });
  if (!response.ok) {
    throw new Error(`MDS3 TOC fetch failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  cache = parseTocJwt(text);
  logger.debug("MDS3 TOC refreshed", { entryCount: cache.entries.size, nextUpdate: cache.nextUpdate });
}

/**
 * Ensure the cache is populated and reasonably fresh.
 */
async function ensureCache(): Promise<void> {
  if (!isCacheFresh()) {
    await refreshToc();
  }
}

/**
 * Fetch and parse the individual metadata statement for an entry URL.
 * The statement is also a JWT; we only decode the payload.
 */
async function fetchEntryStatement(entry: MDS3Entry): Promise<void> {
  if (!entry.url || entry.description !== undefined) return;

  try {
    const headers: Record<string, string> = {};
    if (initApiKey) headers["Authorization"] = `Bearer ${initApiKey}`;

    const response = await fetch(entry.url, { headers });
    if (!response.ok) {
      logger.warn("MDS3 entry statement fetch failed", { url: entry.url, status: response.status });
      return;
    }

    const jwt = await response.text();
    const parts = jwt.trim().split(".");
    if (parts.length < 2) return;

    const payload = JSON.parse(base64urlDecode(parts[1])) as {
      description?: string;
      authenticatorVersion?: number;
      protocolFamily?: string;
    };

    entry.description = payload.description;
    entry.authenticatorVersion = payload.authenticatorVersion;
    entry.protocolFamily = payload.protocolFamily;
  } catch (err) {
    logger.warn("Error fetching MDS3 entry statement", { error: String(err) });
  }
}

/**
 * Look up an AAGUID in the MDS3 TOC.
 *
 * Returns `null` if the AAGUID is not found or the MDS3 service is unreachable.
 */
export async function getMDS3Entry(aaguid: string): Promise<MDS3Entry | null> {
  try {
    await ensureCache();
  } catch (err) {
    logger.warn("MDS3 unavailable during getMDS3Entry", { error: String(err) });
    return null;
  }

  if (!cache) return null;

  const normalised = aaguid.toLowerCase();
  const entry = cache.entries.get(normalised) ?? null;
  if (!entry) return null;

  // Lazily fetch the full metadata statement for description
  await fetchEntryStatement(entry);

  return entry;
}

/** Certified status values, ordered from highest to lowest assurance */
const CERTIFIED_STATUSES = new Set<MDS3AuthenticatorStatus>([
  "FIDO_CERTIFIED",
  "FIDO_CERTIFIED_L1",
  "FIDO_CERTIFIED_L2",
  "FIDO_CERTIFIED_L3",
]);

/**
 * Returns `true` if the device identified by `aaguid` has an active
 * FIDO_CERTIFIED (or higher) status in MDS3.
 *
 * Returns `false` if the device is not found, is revoked/compromised, or
 * the MDS3 service is unreachable.
 */
export async function isFidoCertified(aaguid: string): Promise<boolean> {
  try {
    const entry = await getMDS3Entry(aaguid);
    if (!entry) return false;

    // If any report shows a negative status, reject immediately
    const negativeStatuses = new Set<MDS3AuthenticatorStatus>([
      "REVOKED",
      "ATTESTATION_KEY_COMPROMISE",
      "USER_KEY_REMOTE_COMPROMISE",
      "USER_KEY_PHYSICAL_COMPROMISE",
      "USER_VERIFICATION_BYPASS",
    ]);

    let hasCertified = false;
    for (const report of entry.statusReports) {
      if (negativeStatuses.has(report.status)) return false;
      if (CERTIFIED_STATUSES.has(report.status)) hasCertified = true;
    }

    return hasCertified;
  } catch (err) {
    logger.warn("isFidoCertified check failed", { error: String(err) });
    return false;
  }
}

/**
 * Returns the human-readable description string for the device, or `null`
 * if the device is not found in MDS3 or the service is unreachable.
 */
export async function getDeviceDescription(aaguid: string): Promise<string | null> {
  try {
    const entry = await getMDS3Entry(aaguid);
    if (!entry) return null;
    return entry.description ?? null;
  } catch (err) {
    logger.warn("getDeviceDescription failed", { error: String(err) });
    return null;
  }
}
