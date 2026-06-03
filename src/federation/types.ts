export interface FederatedProvider {
  id: string;
  name: string;
  issuerUrl: string;
  jwksUri?: string;
  trustedTenantId?: string;
  enabled: boolean;
  createdAt: Date;
}

export interface FederationTokenRequest {
  subjectToken: string;
  subjectTokenType: string;
  scope?: string;
  audience?: string;
  providerId: string;
}

export interface FederationTokenResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  issuedTokenType: string;
}

export interface FederatedClaim {
  sub: string;
  email?: string;
  scope?: string[];
}
