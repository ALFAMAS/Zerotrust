"use strict";
// ─── Configuration Types ─────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_JIT_GRANT_TTL = exports.DEFAULT_OTP_TTL = exports.DEFAULT_SESSION_TTL = exports.DEFAULT_REFRESH_TOKEN_TTL = exports.DEFAULT_ACCESS_TOKEN_TTL = exports.ErrorCodes = exports.zerotrustError = void 0;
// ─── Error Types ──────────────────────────────────────────────────────────
class zerotrustError extends Error {
    constructor(code, message, statusCode = 400, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = "zerotrustError";
    }
}
exports.zerotrustError = zerotrustError;
exports.ErrorCodes = {
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    TOKEN_INVALID: "TOKEN_INVALID",
    TOKEN_REVOKED: "TOKEN_REVOKED",
    MFA_REQUIRED: "MFA_REQUIRED",
    MFA_INVALID: "MFA_INVALID",
    PASSKEY_NOT_FOUND: "PASSKEY_NOT_FOUND",
    ACCESS_DENIED: "ACCESS_DENIED",
    INSUFFICIENT_PRIVILEGE: "INSUFFICIENT_PRIVILEGE",
    RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
    USER_NOT_FOUND: "USER_NOT_FOUND",
    USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
    USER_SUSPENDED: "USER_SUSPENDED",
    USER_DELETED: "USER_DELETED",
    DEVICE_NOT_TRUSTED: "DEVICE_NOT_TRUSTED",
    DEVICE_COMPROMISED: "DEVICE_COMPROMISED",
    SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
    SESSION_EXPIRED: "SESSION_EXPIRED",
    MAX_DEVICES_EXCEEDED: "MAX_DEVICES_EXCEEDED",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
    ACCESS_DENIED_LOCATION: "ACCESS_DENIED_LOCATION",
    ACCESS_DENIED_IP: "ACCESS_DENIED_IP",
    INVALID_REQUEST: "INVALID_REQUEST",
    INTERNAL_ERROR: "INTERNAL_ERROR",
};
// ─── Constants ──────────────────────────────────────────────────────────
exports.DEFAULT_ACCESS_TOKEN_TTL = 3600;
exports.DEFAULT_REFRESH_TOKEN_TTL = 604800;
exports.DEFAULT_SESSION_TTL = 86400;
exports.DEFAULT_OTP_TTL = 900;
exports.DEFAULT_JIT_GRANT_TTL = 1800;
//# sourceMappingURL=types.js.map