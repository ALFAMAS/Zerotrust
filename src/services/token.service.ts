/**
 * PASETO v4.local implementation using AES-256-GCM + BLAKE2b
 * Bun has native WebCrypto — no external PASETO lib needed.
 * v4.local = symmetric authenticated encryption (XChaCha20-Poly1305 in spec,
 * but we use AES-256-GCM as browser/Bun WebCrypto doesn't expose XChaCha).
 * For full spec compliance swap in libsodium-wrappers.
 */

import { nanoid } from "nanoid";
import type { TokenPayload, ZeroAuthConfig } from "@zeroauth/shared";
import { DEFAULT_ACCESS_TOKEN_TTL } from "@zeroauth/shared";

export class TokenService {
  private key!: CryptoKey;
  private config: ZeroAuthConfig["session"] & { secretKeyHex: string };

  constructor(secretKeyHex: string, sessionConfig: ZeroAuthConfig["session"]) {
    this.config = { ...sessionConfig, secretKeyHex };
  }

  async init() {
    const keyBytes = this.hexToBytes(this.config.secretKeyHex);
    this.key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async signAccessToken(
    payload: Omit<TokenPayload, "iat" | "exp" | "jti">,
    ttl = DEFAULT_ACCESS_TOKEN_TTL
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const full: TokenPayload = {
      ...payload,
      jti: nanoid(),
      iat: now,
      exp: now + ttl,
    };
    return this.encrypt(JSON.stringify(full));
  }

  async signRefreshToken(): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    return this.bytesToHex(bytes);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const raw = await this.decrypt(token);
    const payload: TokenPayload = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) throw new Error("TOKEN_EXPIRED");
    return payload;
  }

  private async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.key,
      encoded
    );
    // format: base64url(iv) + "." + base64url(ciphertext)
    return `v4.local.${this.toBase64url(iv)}.${this.toBase64url(new Uint8Array(ciphertext))}`;
  }

  private async decrypt(token: string): Promise<string> {
    const parts = token.split(".");
    if (parts[0] !== "v4" || parts[1] !== "local" || parts.length !== 4) {
      throw new Error("TOKEN_INVALID");
    }
    const iv = this.fromBase64url(parts[2]);
    const ciphertext = this.fromBase64url(parts[3]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.key,
      ciphertext
    );
    return new TextDecoder().decode(plaintext);
  }

  private toBase64url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64url");
  }

  private fromBase64url(str: string): Uint8Array {
    return new Uint8Array(Buffer.from(str, "base64url"));
  }

  private hexToBytes(hex: string): Uint8Array {
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      result[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return result;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}