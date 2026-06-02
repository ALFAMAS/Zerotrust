export type DIDMethod = "key" | "web" | "ion" | "ethr";

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DIDDocument {
  "@context": string | string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
}

export interface DIDAuthChallenge {
  id: string;
  did: string;
  challenge: string;
  domain: string;
  expiresAt: Date;
}

export interface DIDProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: "authentication";
  challenge: string;
  domain: string;
  proofValue: string;
}

export interface DIDAuthResult {
  verified: boolean;
  did?: string;
  method?: DIDMethod;
  reason?: string;
}
