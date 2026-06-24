/**
 * Client-Side Field Level Encryption (CSFLE) management
 * Encrypts sensitive user attributes with key rotation support
 */

import { getConfig } from "../config";
import type { zerotrustConfig } from "../shared/types";

export interface EncryptionKeyVersion {
  versionId: string;
  keyMaterial: Uint8Array;
  createdAt: Date;
  isActive: boolean;
  rotatedAt?: Date;
}

class CSFLEManager {
  private keyVersions: Map<string, EncryptionKeyVersion> = new Map();
  private masterKey!: CryptoKey;
  private currentKeyVersionId!: string;
  private config: zerotrustConfig;

  constructor(config: zerotrustConfig) {
    this.config = config;
  }

  /**
   * Initialize CSFLE system with master key
   */
  async initialize(): Promise<void> {
    try {
      const masterKeyHex = this.config.security.csfleMasterKeyHex;
      const keyBytes = this.hexToBytes(masterKeyHex);

      // Import master key for key derivation
      this.masterKey = await crypto.subtle.importKey(
        "raw",
        keyBytes as unknown as ArrayBuffer,
        { name: "HKDF", hash: "SHA-256" },
        false,
        ["deriveKey"]
      );

      // Create initial key version
      this.currentKeyVersionId = `v1-${Date.now()}`;
      await this.createKeyVersion(this.currentKeyVersionId);
    } catch (error) {
      console.error("✗ Failed to initialize CSFLE:", error);
      throw error;
    }
  }

  /**
   * Create a new key version using HKDF derivation
   */
  private async createKeyVersion(versionId: string): Promise<EncryptionKeyVersion> {
    try {
      // Derive a new key from master key using HKDF
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const info = new TextEncoder().encode(`zerotrust-csfle-${versionId}`);

      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt,
          info,
        },
        this.masterKey,
        { name: "AES-GCM", length: 256 },
        true, // extractable for backup
        ["encrypt", "decrypt"]
      );

      // Extract key material for storage/audit
      const keyMaterial = await crypto.subtle.exportKey("raw", derivedKey);

      const keyVersion: EncryptionKeyVersion = {
        versionId,
        keyMaterial: new Uint8Array(keyMaterial),
        createdAt: new Date(),
        isActive: true,
      };

      this.keyVersions.set(versionId, keyVersion);
      return keyVersion;
    } catch (error) {
      console.error(`Failed to create key version ${versionId}:`, error);
      throw error;
    }
  }

  /**
   * Rotate encryption keys
   * Creates new key version and marks old as inactive
   */
  async rotateKeys(): Promise<string> {
    try {
      // Mark current key as inactive
      const currentVersion = this.keyVersions.get(this.currentKeyVersionId);
      if (currentVersion) {
        currentVersion.isActive = false;
        currentVersion.rotatedAt = new Date();
      }

      // Create new key version
      const newVersionId = `v${this.keyVersions.size + 1}-${Date.now()}`;
      await this.createKeyVersion(newVersionId);
      this.currentKeyVersionId = newVersionId;
      return newVersionId;
    } catch (error) {
      console.error("Failed to rotate keys:", error);
      throw error;
    }
  }

  /**
   * Get the current active key version
   */
  private async getCurrentKey(): Promise<CryptoKey> {
    const keyVersion = this.keyVersions.get(this.currentKeyVersionId);
    if (!keyVersion) {
      throw new Error("Current key version not found");
    }

    return crypto.subtle.importKey(
      "raw",
      keyVersion.keyMaterial as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt a value with the current key
   */
  async encrypt(
    plaintext: string | Buffer
  ): Promise<{ ciphertext: string; keyVersion: string; iv: string }> {
    try {
      const key = await this.getCurrentKey();
      const data = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;

      // Generate IV for AES-GCM
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv as unknown as ArrayBuffer,
          additionalData: new TextEncoder().encode(this.currentKeyVersionId),
        },
        key,
        data as unknown as ArrayBuffer
      );

      return {
        ciphertext: this.bytesToBase64url(new Uint8Array(ciphertext)),
        keyVersion: this.currentKeyVersionId,
        iv: this.bytesToBase64url(iv),
      };
    } catch (error) {
      console.error("Encryption failed:", error);
      throw error;
    }
  }

  /**
   * Decrypt a value (handles multiple key versions)
   */
  async decrypt(ciphertext: string, keyVersion: string, iv: string): Promise<string> {
    try {
      const keyVersionData = this.keyVersions.get(keyVersion);
      if (!keyVersionData) {
        throw new Error(`Key version ${keyVersion} not found`);
      }

      const key = await crypto.subtle.importKey(
        "raw",
        keyVersionData.keyMaterial as unknown as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      const ivBytes = this.base64urlToBytes(iv);
      const ciphertextBytes = this.base64urlToBytes(ciphertext);

      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBytes as unknown as ArrayBuffer,
          additionalData: new TextEncoder().encode(keyVersion),
        },
        key,
        ciphertextBytes as unknown as ArrayBuffer
      );

      return new TextDecoder().decode(plaintext);
    } catch (error) {
      console.error("Decryption failed:", error);
      throw error;
    }
  }

  /**
   * Get all key versions (for audit/rotation purposes)
   */
  getKeyVersions(): EncryptionKeyVersion[] {
    return Array.from(this.keyVersions.values());
  }

  /**
   * Check if key rotation is due
   */
  isKeyRotationDue(): boolean {
    const currentVersion = this.keyVersions.get(this.currentKeyVersionId);
    if (!currentVersion) return false;

    const daysSinceCreation =
      (Date.now() - currentVersion.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation >= this.config.security.csflekeyRotationIntervalDays;
  }

  // Utility methods
  private hexToBytes(hex: string): Uint8Array {
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      result[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return result;
  }

  private bytesToBase64url(bytes: Uint8Array): string {
    const binary = String.fromCharCode(...Array.from(bytes));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  private base64urlToBytes(str: string): Uint8Array {
    const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return new Uint8Array(Array.from(binary, (c) => c.charCodeAt(0)));
  }
}

let csfleSingleton: CSFLEManager | null = null;

/**
 * Initialize and get CSFLE manager
 */
export async function initializeCSFLE(config?: zerotrustConfig): Promise<CSFLEManager> {
  if (csfleSingleton) return csfleSingleton;

  const cfg = config || getConfig();
  const manager = new CSFLEManager(cfg);
  await manager.initialize();

  csfleSingleton = manager;
  return manager;
}

/**
 * Get CSFLE manager instance
 */
export function getCSFLE(): CSFLEManager {
  if (!csfleSingleton) {
    throw new Error("CSFLE not initialized. Call initializeCSFLE() first.");
  }
  return csfleSingleton;
}

/**
 * Reset CSFLE (for testing)
 */
export function resetCSFLE(): void {
  csfleSingleton = null;
}

/**
 * @deprecated Use CSFLE.encrypt/decrypt directly with Drizzle queries.
 * Kept for backward compatibility only.
 */
export function csflEncryptionPlugin(schema: any, options: { fields: string[] }): void {
  const fieldsToEncrypt = options.fields || [];

  // Pre-save: encrypt sensitive fields
  schema.pre("save", async function (this: any, next: any) {
    const csfle = getCSFLE();
    for (const field of fieldsToEncrypt) {
      if (this[field] && typeof this[field] === "string") {
        const { ciphertext, keyVersion, iv } = await csfle.encrypt(this[field]);
        // Store encrypted value with metadata
        this[`_${field}_encrypted`] = {
          ciphertext,
          keyVersion,
          iv,
          encryptedAt: new Date(),
        };
        // Clear plaintext
        this[field] = undefined;
      }
    }
    next();
  });

  // Post-retrieve: decrypt sensitive fields
  schema.post("find", async function (this: any, docs: any[], next: any) {
    const csfle = getCSFLE();
    for (const doc of docs) {
      await decryptFieldsInDoc(doc, fieldsToEncrypt, csfle);
    }
    next();
  });

  schema.post("findOne", async (doc: any, next: any) => {
    if (doc) {
      const csfle = getCSFLE();
      await decryptFieldsInDoc(doc, fieldsToEncrypt, csfle);
    }
    next();
  });

  schema.post("findOneAndUpdate", async (doc: any, next: any) => {
    if (doc) {
      const csfle = getCSFLE();
      await decryptFieldsInDoc(doc, fieldsToEncrypt, csfle);
    }
    next();
  });
}

/**
 * Helper to decrypt fields in a document
 */
async function decryptFieldsInDoc(doc: any, fields: string[], csfle: CSFLEManager): Promise<void> {
  for (const field of fields) {
    const encryptedData = doc[`_${field}_encrypted`];
    if (encryptedData) {
      try {
        doc[field] = await csfle.decrypt(
          encryptedData.ciphertext,
          encryptedData.keyVersion,
          encryptedData.iv
        );
      } catch (error) {
        console.error(`Failed to decrypt field ${field}:`, error);
        doc[field] = undefined;
      }
    }
  }
}

// Auto-use plugin on User schema
export function applyCSFLEToUserSchema(UserSchema: any): void {
  const fieldsToEncrypt = [
    "email",
    "phone",
    "passwordHash",
    "mfa.totp.secret",
    "oauthProviders.email",
  ];
  UserSchema.plugin(csflEncryptionPlugin, { fields: fieldsToEncrypt });
}
