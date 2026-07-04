"use strict";
/**
 * Access tokens are spec-compliant PASETO v4.local tokens
 * (XChaCha20 + keyed BLAKE2b with PAE), implemented in ../crypto/paseto-v4.ts
 * and validated against the official paseto-standard test vectors.
 *
 * Refresh tokens are opaque random strings (not PASETO) — they carry no claims
 * and are looked up server-side.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const nanoid_1 = require("nanoid");
const paseto_v4_1 = require("../../crypto/paseto-v4");
const types_1 = require("../../shared/types");
class TokenService {
    constructor(secretKeyHex, sessionConfig) {
        this.config = { ...sessionConfig, secretKeyHex };
    }
    // Kept async for call-site compatibility; v4.local needs no key import step.
    async init() {
        const keyBytes = this.hexToBytes(this.config.secretKeyHex);
        if (keyBytes.length !== 32) {
            throw new Error("TOKEN_SECRET_INVALID: expected a 32-byte (64 hex char) key");
        }
        this.key = keyBytes;
    }
    async signAccessToken(payload, ttl = types_1.DEFAULT_ACCESS_TOKEN_TTL) {
        const now = Math.floor(Date.now() / 1000);
        const full = {
            ...payload,
            jti: (0, nanoid_1.nanoid)(),
            iat: now,
            exp: now + ttl,
        };
        return (0, paseto_v4_1.encrypt)(this.key, new TextEncoder().encode(JSON.stringify(full)));
    }
    async signRefreshToken() {
        const bytes = crypto.getRandomValues(new Uint8Array(48));
        return this.bytesToHex(bytes);
    }
    async verifyAccessToken(token) {
        let raw;
        try {
            raw = new TextDecoder().decode((0, paseto_v4_1.decrypt)(this.key, token));
        }
        catch (err) {
            // Normalize all PASETO-level failures to the existing public error code.
            if (err instanceof paseto_v4_1.PasetoError)
                throw new Error("TOKEN_INVALID");
            throw err;
        }
        let payload;
        try {
            payload = JSON.parse(raw);
        }
        catch {
            throw new Error("TOKEN_INVALID");
        }
        if (payload === null || typeof payload !== "object" || typeof payload.exp !== "number") {
            throw new Error("TOKEN_INVALID");
        }
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now)
            throw new Error("TOKEN_EXPIRED");
        return payload;
    }
    hexToBytes(hex) {
        const result = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            result[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return result;
    }
    bytesToHex(bytes) {
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }
}
exports.TokenService = TokenService;
//# sourceMappingURL=token.service.js.map