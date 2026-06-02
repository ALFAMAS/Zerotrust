/**
 * ZeroAuth SDK – public TypeScript types and interfaces.
 *
 * Passkey / WebAuthn shapes mirror @simplewebauthn/types v10.
 * If that package is installed the identical types are used directly;
 * otherwise the manual definitions here are fully compatible.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Strategy for persisting tokens between sessions. */
export type TokenStorageType = "memory" | "localStorage" | "cookie";

/**
 * Configuration passed to {@link ZeroAuthClient} on construction.
 */
export interface ZeroAuthClientConfig {
  /**
   * Base URL of the ZeroAuth API, without a trailing slash.
   * @example "https://auth.example.com"
   */
  baseUrl: string;

  /**
   * Token storage backend.
   * - `"memory"` (default) – in-memory; suitable for SSR / Node.js.
   * - `"localStorage"` – browser `localStorage`.
   * - `"cookie"` – browser `document.cookie`.
   * Alternatively pass a custom {@link TokenStorage} implementation.
   */
  tokenStorage?: TokenStorageType | TokenStorage;

  /**
   * Called when a token refresh attempt fails.
   * Use to redirect to the login page, clear application state, etc.
   */
  onRefreshFailed?: (error: Error) => void;

  /**
   * Request timeout in milliseconds (default: 30 000).
   */
  timeout?: number;

  /**
   * Additional headers sent with every request.
   * Useful for `X-Tenant-ID` or similar application-level headers.
   */
  defaultHeaders?: Record<string, string>;
}

// ─── Token Storage ────────────────────────────────────────────────────────────

/**
 * Interface that all token storage implementations must satisfy.
 * Implement this to provide custom storage (e.g. encrypted storage, React Native AsyncStorage).
 */
export interface TokenStorage {
  /** Retrieve the value stored at `key`, or `null` if absent. */
  get(key: string): string | null | Promise<string | null>;
  /** Persist `value` at `key`. */
  set(key: string, value: string): void | Promise<void>;
  /** Delete the entry at `key`. */
  remove(key: string): void | Promise<void>;
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Tokens returned on a successful login, token refresh, OAuth callback,
 * passkey authentication, or magic-link verification.
 */
export interface AuthResult {
  /** PASETO v4 access token. */
  accessToken: string;
  /** Opaque refresh token used to rotate the access token. */
  refreshToken?: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /** Always `"Bearer"`. */
  tokenType: "Bearer";
}

/**
 * Result returned by {@link ZeroAuthClient.register}.
 */
export interface RegisterResult {
  /** Whether registration succeeded. */
  success: boolean;
  /** The new user's ID. */
  userId: string;
}

/**
 * Optional overrides for {@link ZeroAuthClient.login}.
 */
export interface LoginOptions {
  /**
   * When `true`, the SDK will store the refresh token in the configured
   * storage for cross-session persistence (default: `false`).
   */
  rememberMe?: boolean;
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/** Supported OAuth providers. */
export type OAuthProvider = "google" | "github" | "facebook" | "apple";

/**
 * Options for {@link ZeroAuthClient.getOAuthUrl}.
 */
export interface OAuthOptions {
  /**
   * PKCE code challenge (base64url-encoded SHA-256 of the verifier).
   * Strongly recommended in browser environments.
   */
  codeChallenge?: string;
  /**
   * The URI the provider should redirect back to after authorization.
   * Defaults to the current page's origin.
   */
  redirectUri?: string;
  /** Additional query parameters forwarded to the provider. */
  extraParams?: Record<string, string>;
}

// ─── MFA ─────────────────────────────────────────────────────────────────────

/**
 * Result of {@link ZeroAuthClient.setupTOTP}.
 */
export interface TOTPSetupResult {
  /** Raw TOTP secret in base32 encoding. */
  secret: string;
  /** `otpauth://` URL for QR code generation. */
  otpAuthUrl: string;
  /** Data URI (`data:image/png;base64,…`) of the pre-rendered QR code image. */
  qrCodeUrl: string;
  /**
   * One-time backup codes presented at setup time.
   * Store these securely – they are never shown again.
   */
  backupCodes: string[];
}

/** OTP delivery channels supported by the API. */
export type OTPChannel = "email" | "sms" | "whatsapp" | "telegram";

// ─── Passkeys / WebAuthn ──────────────────────────────────────────────────────

/*
 * The following types match the shapes defined by the W3C WebAuthn spec and
 * used by @simplewebauthn/browser / @simplewebauthn/types v10.
 * They are defined here so the SDK has zero hard runtime dependencies.
 */

export type Base64URLString = string;

export interface AuthenticatorTransportFuture {
  readonly transport: string;
}

export interface PublicKeyCredentialDescriptorJSON {
  id: Base64URLString;
  type: "public-key";
  transports?: AuthenticatorTransport[];
}

export type AuthenticatorTransport =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";

export type COSEAlgorithmIdentifier = number;

export interface PublicKeyCredentialParametersJSON {
  alg: COSEAlgorithmIdentifier;
  type: "public-key";
}

export interface AuthenticatorSelectionCriteria {
  authenticatorAttachment?: "cross-platform" | "platform";
  requireResidentKey?: boolean;
  residentKey?: "discouraged" | "preferred" | "required";
  userVerification?: "discouraged" | "preferred" | "required";
}

export interface PublicKeyCredentialUserEntityJSON {
  id: Base64URLString;
  name: string;
  displayName: string;
}

export interface PublicKeyCredentialRpEntityJSON {
  id?: string;
  name: string;
}

/**
 * Registration ceremony options issued by the server.
 * Passed directly to `@simplewebauthn/browser`'s `startRegistration()`.
 */
export interface PublicKeyCredentialCreationOptionsJSON {
  rp: PublicKeyCredentialRpEntityJSON;
  user: PublicKeyCredentialUserEntityJSON;
  challenge: Base64URLString;
  pubKeyCredParams: PublicKeyCredentialParametersJSON[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputsJSON;
}

export type AttestationConveyancePreference = "direct" | "enterprise" | "indirect" | "none";

export interface AuthenticationExtensionsClientInputsJSON {
  appid?: string;
  credProps?: boolean;
  hmacCreateSecret?: boolean;
  [key: string]: unknown;
}

export interface AuthenticatorAttestationResponseJSON {
  clientDataJSON: Base64URLString;
  attestationObject: Base64URLString;
  authenticatorData?: Base64URLString;
  transports?: AuthenticatorTransport[];
  publicKeyAlgorithm?: COSEAlgorithmIdentifier;
  publicKey?: Base64URLString;
}

/**
 * The credential object returned by `@simplewebauthn/browser`'s `startRegistration()`.
 * Pass it directly to {@link ZeroAuthClient.registerPasskey}.
 */
export interface RegistrationResponseJSON {
  id: Base64URLString;
  rawId: Base64URLString;
  response: AuthenticatorAttestationResponseJSON;
  authenticatorAttachment?: "cross-platform" | "platform";
  clientExtensionResults: AuthenticationExtensionsClientOutputsJSON;
  type: "public-key";
}

export interface AuthenticationExtensionsClientOutputsJSON {
  appid?: boolean;
  credProps?: CredentialPropertiesOutput;
  hmacCreateSecret?: boolean;
  [key: string]: unknown;
}

export interface CredentialPropertiesOutput {
  rk?: boolean;
}

/**
 * Authentication ceremony options issued by the server.
 * Passed directly to `@simplewebauthn/browser`'s `startAuthentication()`.
 */
export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: Base64URLString;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: "discouraged" | "preferred" | "required";
  extensions?: AuthenticationExtensionsClientInputsJSON;
  /** Server-side challenge key for correlation (ZeroAuth-specific). */
  challengeKey?: string;
}

export interface AuthenticatorAssertionResponseJSON {
  clientDataJSON: Base64URLString;
  authenticatorData: Base64URLString;
  signature: Base64URLString;
  userHandle?: Base64URLString;
}

/**
 * The credential object returned by `@simplewebauthn/browser`'s `startAuthentication()`.
 * Pass it directly to {@link ZeroAuthClient.authenticateWithPasskey}.
 */
export interface AuthenticationResponseJSON {
  id: Base64URLString;
  rawId: Base64URLString;
  response: AuthenticatorAssertionResponseJSON;
  authenticatorAttachment?: "cross-platform" | "platform";
  clientExtensionResults: AuthenticationExtensionsClientOutputsJSON;
  type: "public-key";
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** Partial device fingerprint returned by the sessions API. */
export interface SessionDeviceFingerprint {
  platform?: string;
  browser?: string;
  os?: string;
}

/**
 * A session record as returned by {@link ZeroAuthClient.getSessions}.
 */
export interface Session {
  id: string;
  deviceFingerprint: SessionDeviceFingerprint;
  ipAddress: string;
  country?: string;
  userAgent: string;
  isActive: boolean;
  /** Whether this entry represents the caller's current session. */
  isCurrent?: boolean;
  createdAt: string;
  lastActivityAt: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface UserMFAStatus {
  totp: {
    enabled: boolean;
    verifiedAt?: string;
  };
  webauthn: {
    enabled: boolean;
  };
}

export interface UserPasskey {
  credentialId: string;
  name?: string;
  deviceType?: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface UserOAuthProvider {
  provider: OAuthProvider;
  providerId: string;
  email?: string;
  connectedAt: string;
}

/**
 * User profile returned by {@link ZeroAuthClient.getMe} and {@link ZeroAuthClient.updateMe}.
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
  roles: string[];
  mfa: UserMFAStatus;
  passkeys: UserPasskey[];
  oauthProviders: UserOAuthProvider[];
  status: "active" | "suspended" | "pending" | "deleted";
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fields accepted by {@link ZeroAuthClient.updateMe}.
 * All fields are optional; only provided fields are updated.
 */
export interface UserUpdateInput {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
}

// ─── Auth State ───────────────────────────────────────────────────────────────

/** Current authentication state of the SDK client. */
export type AuthState = "authenticated" | "unauthenticated" | "loading";

/** Payload passed to auth state change subscribers. */
export interface AuthStatePayload {
  state: AuthState;
  /** Present when `state === "authenticated"`. */
  accessToken?: string;
}

// ─── Magic Links ──────────────────────────────────────────────────────────────

export interface MagicLinkResult {
  success: boolean;
  message: string;
}

// ─── MFA Challenge ────────────────────────────────────────────────────────────

export interface MFAChallengeInfo {
  challengeId: string;
  expiresIn: number;
  channels: OTPChannel[];
}

// ─── Passkey / OAuth Provider Info ───────────────────────────────────────────

export type PasskeyInfo = UserPasskey;
export type OAuthProviderInfo = UserOAuthProvider;
