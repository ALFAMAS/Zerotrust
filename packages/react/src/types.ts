import type { ZeroAuthClient } from "@zeroauth/sdk";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  mfa?: {
    totp?: { enabled: boolean };
    emailOtp?: { enabled: boolean };
    smsOtp?: { enabled: boolean };
  };
  passkeys?: Array<{ credentialId: string; name?: string; createdAt: string }>;
  oauthProviders?: Array<{ provider: string; providerId: string }>;
  roles?: string[];
  tenantId?: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ZeroAuthContextValue {
  client: ZeroAuthClient;
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export interface ZeroAuthProviderProps {
  baseUrl: string;
  children: React.ReactNode;
  tokenStorage?: "memory" | "localStorage" | "cookie";
  onAuthStateChange?: (user: AuthUser | null) => void;
}
