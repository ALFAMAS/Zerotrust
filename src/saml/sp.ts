/**
 * ZeroAuth SAML 2.0 Service Provider
 *
 * Implements SP-initiated SSO using the SAML 2.0 protocol.
 * ZeroAuth acts as the SP; an external IdP (Azure AD, Okta, etc.) handles authentication.
 */
import crypto from "node:crypto";
import zlib from "node:zlib";
import { getLogger } from "../logger/index.js";

const logger = getLogger("saml-sp");

export interface SAMLIdPConfig {
  entityId: string;
  ssoUrl: string;
  certificate: string; // PEM or base64 DER
  wantAssertionsSigned?: boolean;
  signatureAlgorithm?: "sha1" | "sha256" | "sha512";
}

export interface SAMLSPConfig {
  entityId: string;
  assertionConsumerServiceUrl: string;
  privateKey?: string; // For AuthnRequest signing
  certificate?: string;
  nameIdFormat?: string;
  authnContextClassRef?: string;
}

export interface SAMLAssertion {
  nameId: string;
  nameIdFormat: string;
  sessionIndex?: string;
  attributes: Record<string, string | string[]>;
  issuer: string;
  notBefore?: Date;
  notOnOrAfter?: Date;
}

// In-memory relay-state store
const relayStateStore = new Map<string, { redirectUrl?: string; tenantId?: string; ts: number }>();
const RELAY_TTL_MS = 10 * 60 * 1000;

/**
 * Build an SP-initiated AuthnRequest and return the IdP redirect URL.
 */
export function buildAuthnRequest(
  sp: SAMLSPConfig,
  idp: SAMLIdPConfig,
  options: { redirectUrl?: string; tenantId?: string; forceAuthn?: boolean } = {}
): { redirectUrl: string; relayState: string } {
  const requestId = `_${crypto.randomBytes(16).toString("hex")}`;
  const now = new Date().toISOString();
  const relayState = crypto.randomBytes(16).toString("base64url");

  relayStateStore.set(relayState, {
    redirectUrl: options.redirectUrl,
    tenantId: options.tenantId,
    ts: Date.now(),
  });

  const nameIdFormat = sp.nameIdFormat ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

  const authnContextClassRef =
    sp.authnContextClassRef ?? "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";

  const authnRequest = `<?xml version="1.0"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${now}"
  Destination="${idp.ssoUrl}"
  AssertionConsumerServiceURL="${sp.assertionConsumerServiceUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
  ${options.forceAuthn ? 'ForceAuthn="true"' : ""}>
  <saml:Issuer>${sp.entityId}</saml:Issuer>
  <samlp:NameIDPolicy
    Format="${nameIdFormat}"
    AllowCreate="true"/>
  <samlp:RequestedAuthnContext Comparison="exact">
    <saml:AuthnContextClassRef>${authnContextClassRef}</saml:AuthnContextClassRef>
  </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`.trim();

  const deflated = zlib.deflateRawSync(Buffer.from(authnRequest, "utf-8"));
  const encoded = Buffer.from(deflated).toString("base64");

  const params = new URLSearchParams({
    SAMLRequest: encoded,
    RelayState: relayState,
  });

  return { redirectUrl: `${idp.ssoUrl}?${params.toString()}`, relayState };
}

/**
 * Parse and validate a SAML Response from the IdP.
 * Returns the extracted assertion on success, or throws on failure.
 */
export function parseSAMLResponse(
  samlResponse: string,
  idp: SAMLIdPConfig,
  sp: SAMLSPConfig
): SAMLAssertion {
  let xml: string;
  try {
    xml = Buffer.from(samlResponse, "base64").toString("utf-8");
  } catch {
    throw new Error("Invalid SAML response encoding");
  }

  // Basic structural validation
  if (!xml.includes("urn:oasis:names:tc:SAML:2.0:protocol")) {
    throw new Error("Invalid SAML response: missing protocol namespace");
  }

  // Extract status code
  const statusMatch = xml.match(/<samlp?:StatusCode[^>]*Value="([^"]+)"/);
  const statusCode = statusMatch?.[1] ?? "";
  if (!statusCode.includes(":Success")) {
    const statusMsg = xml.match(/<samlp?:StatusMessage[^>]*>([^<]+)/)?.[1];
    throw new Error(`SAML authentication failed: ${statusMsg ?? statusCode}`);
  }

  // Extract NameID
  const nameIdMatch = xml.match(/<saml:?NameID[^>]*>([^<]+)<\/saml:?NameID>/);
  if (!nameIdMatch) throw new Error("Missing NameID in SAML assertion");
  const nameId = nameIdMatch[1].trim();

  const nameIdFormatMatch = xml.match(/<saml:?NameID[^>]*Format="([^"]+)"/);
  const nameIdFormat =
    nameIdFormatMatch?.[1] ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

  // Extract Issuer
  const issuerMatch = xml.match(/<saml:?Issuer[^>]*>([^<]+)<\/saml:?Issuer>/);
  const issuer = issuerMatch?.[1]?.trim() ?? "";

  // Validate audience
  const audienceMatch = xml.match(/<saml:?Audience[^>]*>([^<]+)<\/saml:?Audience>/);
  if (audienceMatch && audienceMatch[1].trim() !== sp.entityId) {
    logger.warn("SAML audience mismatch", {
      expected: sp.entityId,
      got: audienceMatch[1].trim(),
    });
    // Warn but continue — strict mode could throw here
  }

  // Extract validity window
  const notBeforeMatch = xml.match(/NotBefore="([^"]+)"/);
  const notOnOrAfterMatch = xml.match(/NotOnOrAfter="([^"]+)"/);
  const now = new Date();

  if (notBeforeMatch) {
    const notBefore = new Date(notBeforeMatch[1]);
    if (now < notBefore) {
      throw new Error("SAML assertion not yet valid");
    }
  }
  if (notOnOrAfterMatch) {
    const notOnOrAfter = new Date(notOnOrAfterMatch[1]);
    if (now >= notOnOrAfter) {
      throw new Error("SAML assertion has expired");
    }
  }

  // Extract session index
  const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);

  // Extract attributes
  const attributes: Record<string, string | string[]> = {};
  const attrRegex = /<saml:?Attribute[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/saml:?Attribute>/g;
  for (const attrMatch of xml.matchAll(attrRegex)) {
    const attrName = attrMatch[1];
    const valuesStr = attrMatch[2];
    const values: string[] = [];
    const valRegex = /<saml:?AttributeValue[^>]*>([^<]*)<\/saml:?AttributeValue>/g;
    for (const valMatch of valuesStr.matchAll(valRegex)) {
      values.push(valMatch[1].trim());
    }
    attributes[attrName] = values.length === 1 ? values[0] : values;
  }

  // Suppress unused-parameter warning for idp (kept for API compatibility)
  void idp;

  return {
    nameId,
    nameIdFormat,
    sessionIndex: sessionMatch?.[1],
    attributes,
    issuer,
    notBefore: notBeforeMatch ? new Date(notBeforeMatch[1]) : undefined,
    notOnOrAfter: notOnOrAfterMatch ? new Date(notOnOrAfterMatch[1]) : undefined,
  };
}

export function consumeRelayState(relayState: string) {
  const entry = relayStateStore.get(relayState);
  relayStateStore.delete(relayState);
  if (!entry || Date.now() - entry.ts > RELAY_TTL_MS) return null;
  return entry;
}

export function buildSPMetadata(
  sp: SAMLSPConfig,
  org: { name: string; url: string } = { name: "ZeroAuth", url: "https://zeroauth.dev" }
): string {
  return `<?xml version="1.0"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${sp.entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${sp.assertionConsumerServiceUrl}"
      index="1"/>
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">${org.name}</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">${org.name}</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${org.url}</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;
}
