import { HttpClient } from "./http";
import { createTokenStorage, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "./token-storage";
import { ZeroAuthSDKError, SDKErrorCodes } from "./errors";
import type {
  ZeroAuthClientConfig,
  TokenStorage,
  AuthResult,
  RegisterResult,
  LoginOptions,
  OAuthOptions,
  TOTPSetupResult,
  Session,
  User,
  UserUpdateInput,
  AuthState,
  MagicLinkResult,
} from "./types";

export class ZeroAuthClient {
  private http: HttpClient;
  private storage: TokenStorage;
  private authStateListeners: Set<(state: AuthState) => void> = new Set();
  private config: ZeroAuthClientConfig;

  constructor(config: ZeroAuthClientConfig) {
    this.config = config;
    this.storage =
      typeof config.tokenStorage === "object" && config.tokenStorage !== null
        ? (config.tokenStorage as TokenStorage)
        : createTokenStorage(
            (config.tokenStorage as "memory" | "localStorage" | "cookie") ?? "memory"
          );

    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      storage: this.storage,
      timeout: config.timeout,
      defaultHeaders: config.defaultHeaders,
      onRefreshFailed: (err) => {
        config.onRefreshFailed?.(err);
        this.notifyAuthState("unauthenticated");
      },
    });
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
    displayName?: string
  ): Promise<RegisterResult> {
    const result = await this.http.post<RegisterResult>("/auth/register", {
      email,
      password,
      displayName,
    }, { skipAuth: true });
    return result;
  }

  async login(email: string, password: string, options?: LoginOptions): Promise<AuthResult> {
    const result = await this.http.post<AuthResult>("/auth/login", {
      email,
      password,
      ...options,
    }, { skipAuth: true });

    await this.saveTokens(result);
    this.notifyAuthState("authenticated");
    return result;
  }

  async logout(): Promise<void> {
    try {
      await this.http.post("/auth/logout");
    } finally {
      await this.clearTokens();
      this.notifyAuthState("unauthenticated");
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await this.http.post("/auth/logout/all");
    } finally {
      await this.clearTokens();
      this.notifyAuthState("unauthenticated");
    }
  }

  async refreshToken(): Promise<AuthResult> {
    const refreshToken = await this.storage.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      throw new ZeroAuthSDKError(SDKErrorCodes.NOT_AUTHENTICATED, "No refresh token available");
    }
    const result = await this.http.post<AuthResult>("/auth/token/refresh", { refreshToken }, { skipAuth: true });
    await this.saveTokens(result);
    return result;
  }

  // ─── OAuth ─────────────────────────────────────────────────────────────────

  getOAuthUrl(
    provider: "google" | "github" | "facebook" | "apple",
    options?: OAuthOptions
  ): string {
    const url = new URL(`/auth/oauth/${provider}`, this.config.baseUrl);
    if (options?.codeChallenge) url.searchParams.set("code_challenge", options.codeChallenge);
    if (options?.state) url.searchParams.set("state", options.state);
    return url.toString();
  }

  async handleOAuthCallback(
    provider: string,
    code: string,
    state: string
  ): Promise<AuthResult> {
    const result = await this.http.get<AuthResult>(
      `/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { skipAuth: true }
    );
    await this.saveTokens(result);
    this.notifyAuthState("authenticated");
    return result;
  }

  // ─── MFA ───────────────────────────────────────────────────────────────────

  async setupTOTP(): Promise<TOTPSetupResult> {
    return this.http.post<TOTPSetupResult>("/auth/mfa/totp/setup");
  }

  async verifyTOTP(code: string): Promise<void> {
    await this.http.post("/auth/mfa/totp/verify", { code });
  }

  async sendOTP(channel: "email" | "sms" | "whatsapp" | "telegram"): Promise<void> {
    await this.http.post("/auth/mfa/send", { channel });
  }

  async verifyOTP(code: string, channel: string): Promise<void> {
    await this.http.post("/auth/mfa/verify", { code, channel });
  }

  // ─── Magic Links ───────────────────────────────────────────────────────────

  async sendMagicLink(email: string, redirectUrl?: string): Promise<MagicLinkResult> {
    return this.http.post<MagicLinkResult>("/auth/magic-link/send", { email, redirectUrl }, { skipAuth: true });
  }

  async verifyMagicLink(token: string, email: string): Promise<AuthResult> {
    const result = await this.http.post<AuthResult>("/auth/magic-link/verify", { token, email }, { skipAuth: true });
    await this.saveTokens(result);
    this.notifyAuthState("authenticated");
    return result;
  }

  // ─── Passkeys / WebAuthn ───────────────────────────────────────────────────

  async getPasskeyRegistrationOptions(): Promise<unknown> {
    return this.http.post("/auth/passkey/register/options");
  }

  async registerPasskey(credential: unknown): Promise<void> {
    await this.http.post("/auth/passkey/register/verify", credential);
  }

  async getPasskeyAuthOptions(): Promise<unknown> {
    return this.http.post("/auth/passkey/auth/options", {}, { skipAuth: true });
  }

  async authenticateWithPasskey(credential: unknown): Promise<AuthResult> {
    const result = await this.http.post<AuthResult>("/auth/passkey/auth/verify", credential, { skipAuth: true });
    await this.saveTokens(result);
    this.notifyAuthState("authenticated");
    return result;
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async getSessions(): Promise<Session[]> {
    return this.http.get<Session[]>("/sessions");
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.http.delete(`/sessions/${sessionId}`);
  }

  // ─── Password Reset ────────────────────────────────────────────────────────

  async requestPasswordReset(email: string): Promise<void> {
    await this.http.post("/auth/password-reset/request", { email }, { skipAuth: true });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.http.post("/auth/password-reset/reset", { token, newPassword }, { skipAuth: true });
  }

  // ─── User ──────────────────────────────────────────────────────────────────

  async getMe(): Promise<User> {
    return this.http.get<User>("/auth/me");
  }

  async updateMe(updates: Partial<UserUpdateInput>): Promise<User> {
    return this.http.patch<User>("/auth/me", updates);
  }

  // ─── Token State ───────────────────────────────────────────────────────────

  getAccessToken(): string | null {
    const val = this.storage.get(ACCESS_TOKEN_KEY);
    if (val instanceof Promise) return null;
    return val;
  }

  isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    this.authStateListeners.add(callback);
    return () => this.authStateListeners.delete(callback);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async saveTokens(result: AuthResult): Promise<void> {
    if (result.accessToken) {
      await this.storage.set(ACCESS_TOKEN_KEY, result.accessToken);
    }
    if (result.refreshToken) {
      await this.storage.set(REFRESH_TOKEN_KEY, result.refreshToken);
    }
  }

  private async clearTokens(): Promise<void> {
    await this.storage.remove(ACCESS_TOKEN_KEY);
    await this.storage.remove(REFRESH_TOKEN_KEY);
  }

  private notifyAuthState(state: AuthState): void {
    for (const listener of this.authStateListeners) {
      try {
        listener(state);
      } catch {
        // ignore listener errors
      }
    }
  }
}
