import crypto from "crypto";
import type { Request, RequestHandler } from "express";

export interface EnterpriseCertificate {
  subject: { CN: string; O?: string; OU?: string; serialNumber?: string };
  issuer: { CN: string; O?: string };
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
}

export interface EnterpriseAttestationCA {
  id: string;
  name: string;
  pem: string;
  tenantId?: string;
  allowedOUs?: string[];
  requireDeviceSerial?: boolean;
  createdAt: Date;
}

class EnterpriseCARegistry {
  private cas = new Map<string, EnterpriseAttestationCA>();

  register(ca: Omit<EnterpriseAttestationCA, "id" | "createdAt">): EnterpriseAttestationCA {
    const record: EnterpriseAttestationCA = { ...ca, id: crypto.randomUUID(), createdAt: new Date() };
    this.cas.set(record.id, record);
    return record;
  }

  unregister(id: string): boolean {
    return this.cas.delete(id);
  }

  list(tenantId?: string): EnterpriseAttestationCA[] {
    const all = Array.from(this.cas.values());
    return tenantId ? all.filter(c => !c.tenantId || c.tenantId === tenantId) : all;
  }

  get(id: string): EnterpriseAttestationCA | null {
    return this.cas.get(id) ?? null;
  }
}

export const enterpriseCARegistry = new EnterpriseCARegistry();

export function parseCertificate(pem: string): EnterpriseCertificate {
  const cert = new crypto.X509Certificate(pem);
  const parseRDN = (dn: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const part of dn.split(/,\s*/)) {
      const [k, ...vParts] = part.split("=");
      if (k && vParts.length) result[k.trim()] = vParts.join("=").trim();
    }
    return result;
  };

  const subject = parseRDN(cert.subject);
  const issuer = parseRDN(cert.issuer);

  return {
    subject: {
      CN: subject["CN"] ?? "",
      O: subject["O"],
      OU: subject["OU"],
      serialNumber: subject["serialNumber"],
    },
    issuer: { CN: issuer["CN"] ?? "", O: issuer["O"] },
    validFrom: new Date(cert.validFrom),
    validTo: new Date(cert.validTo),
    fingerprint: cert.fingerprint256,
  };
}

export async function verifyEnterpriseAttestation(opts: {
  attestationCertPem: string;
  aaguid?: string;
  tenantId?: string;
}): Promise<{ verified: boolean; caId?: string; caName?: string; deviceInfo?: EnterpriseCertificate; reason?: string }> {
  let deviceInfo: EnterpriseCertificate;
  try {
    deviceInfo = parseCertificate(opts.attestationCertPem);
  } catch {
    return { verified: false, reason: "invalid_certificate" };
  }

  const now = new Date();
  if (now < deviceInfo.validFrom || now > deviceInfo.validTo) {
    return { verified: false, reason: "certificate_expired", deviceInfo };
  }

  const candidates = enterpriseCARegistry.list(opts.tenantId);
  for (const ca of candidates) {
    try {
      const caCert = new crypto.X509Certificate(ca.pem);
      const deviceCert = new crypto.X509Certificate(opts.attestationCertPem);

      if (deviceCert.issuer !== caCert.subject) continue;

      const verified = deviceCert.verify(caCert.publicKey);
      if (!verified) continue;

      if (ca.allowedOUs?.length && !ca.allowedOUs.includes(deviceInfo.subject.OU ?? "")) {
        return { verified: false, reason: "ou_not_allowed", caId: ca.id, caName: ca.name, deviceInfo };
      }

      if (ca.requireDeviceSerial && !deviceInfo.subject.serialNumber) {
        return { verified: false, reason: "device_serial_required", caId: ca.id, caName: ca.name, deviceInfo };
      }

      return { verified: true, caId: ca.id, caName: ca.name, deviceInfo };
    } catch {
      continue;
    }
  }

  return { verified: false, reason: "no_matching_ca", deviceInfo };
}

export function requireEnterpriseAttestation(tenantId?: string): RequestHandler {
  return async (req: Request, res: any, next: any) => {
    const certHeader = req.headers["x-attestation-cert"] as string | undefined;
    if (!certHeader) return res.status(403).json({ error: "enterprise_attestation_required" });

    const pem = certHeader.startsWith("-----")
      ? certHeader
      : `-----BEGIN CERTIFICATE-----\n${certHeader}\n-----END CERTIFICATE-----`;

    const result = await verifyEnterpriseAttestation({ attestationCertPem: pem, tenantId });
    if (!result.verified) {
      return res.status(403).json({ error: "enterprise_attestation_failed", reason: result.reason });
    }

    (req as any).enterpriseAttestation = result;
    next();
  };
}
