/**
 * ZeroAuth SDK Error classes
 * Provides structured error information from API responses and SDK operations.
 */

/** Well-known error codes returned by the ZeroAuth API and SDK. */
export const SDKErrorCodes = {
  // Authentication
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_INVALID: "MFA_INVALID",
  PASSKEY_NOT_FOUND: "PASSKEY_NOT_FOUND",

  // Authorization
  ACCESS_DENIED: "ACCESS_DENIED",
  INSUFFICIENT_PRIVILEGE: "INSUFFICIENT_PRIVILEGE",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

  // User Management
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_DELETED: "USER_DELETED",

  // Device & Session
  DEVICE_NOT_TRUSTED: "DEVICE_NOT_TRUSTED",
  DEVICE_COMPROMISED: "DEVICE_COMPROMISED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  MAX_DEVICES_EXCEEDED: "MAX_DEVICES_EXCEEDED",

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",

  // Geofencing
  ACCESS_DENIED_LOCATION: "ACCESS_DENIED_LOCATION",
  ACCESS_DENIED_IP: "ACCESS_DENIED_IP",

  // SDK-specific
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  REFRESH_FAILED: "REFRESH_FAILED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  INVALID_CONFIG: "INVALID_CONFIG",

  // General
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type SDKErrorCode = (typeof SDKErrorCodes)[keyof typeof SDKErrorCodes];

/** Shape of a field-level validation detail returned by the API. */
export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * ZeroAuthSDKError is thrown by all SDK methods on non-2xx responses or
 * internal SDK failures (network errors, timeouts, parse errors).
 *
 * @example
 * ```ts
 * try {
 *   await client.login(email, password);
 * } catch (err) {
 *   if (err instanceof ZeroAuthSDKError) {
 *     console.error(err.code, err.statusCode, err.details);
 *   }
 * }
 * ```
 */
export class ZeroAuthSDKError extends Error {
  /** Machine-readable error code (see {@link SDKErrorCodes}). */
  readonly code: string;
  /** HTTP status code, or 0 for network/timeout errors. */
  readonly statusCode: number;
  /** Optional field-level validation details from the API. */
  readonly details: ErrorDetail[];

  constructor(
    code: string,
    message: string,
    statusCode: number = 0,
    details: ErrorDetail[] = []
  ) {
    super(message);
    this.name = "ZeroAuthSDKError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, ZeroAuthSDKError.prototype);
  }

  /**
   * Build a ZeroAuthSDKError from a raw API error envelope.
   * @internal
   */
  static fromApiResponse(
    statusCode: number,
    body: { code?: string; message?: string; details?: ErrorDetail[] }
  ): ZeroAuthSDKError {
    return new ZeroAuthSDKError(
      body.code ?? SDKErrorCodes.INTERNAL_ERROR,
      body.message ?? "An unknown API error occurred",
      statusCode,
      body.details ?? []
    );
  }

  /** Returns true when the error is an authentication failure (401/403). */
  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /** Returns true when the error is a rate-limit response (429). */
  isRateLimitError(): boolean {
    return this.statusCode === 429;
  }

  /** Returns true when the error is a network or timeout error (statusCode 0). */
  isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}
