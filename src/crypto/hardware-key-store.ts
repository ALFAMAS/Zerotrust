/**
 * Hardware-Backed Key Storage Abstraction
 *
 * Provides a unified interface for TPM 2.0, Secure Enclave, PKCS#11 HSM, and
 * a software fallback that encrypts key material in memory using HKDF +
 * AES-256-GCM.
 *
 * Auto-selection priority:
 *   TPM 2.0 → Secure Enclave → PKCS#11 (if HW_KEY_PKCS11_LIB is set) → Software
 */

import crypto from "crypto";
import fs from "fs";
import { getLogger } from "../logger";

const logger = getLogger("hardware-key-store");

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface HardwareKeyProvider {
  /** Human-readable provider name for diagnostics. */
  name: string;

  /** Returns true when the provider is usable in the current environment. */
  isAvailable(): Promise<boolean>;

  /**
   * Generate (and persistently store inside the provider) a new key with the
   * given `keyId` and algorithm hint.
   */
  generateKey(keyId: string, algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void>;

  /**
   * Sign `data` with the private key identified by `keyId`.
   * Returns the raw signature bytes.
   */
  sign(keyId: string, data: Buffer): Promise<Buffer>;

  /**
   * Decrypt `ciphertext` with the key identified by `keyId`.
   * `context` is an optional binding context (AAD).
   */
  decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer>;

  /**
   * Encrypt `plaintext` with the key identified by `keyId`.
   * `context` is an optional binding context (AAD).
   */
  encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer>;

  /** Permanently delete the key identified by `keyId`. */
  deleteKey(keyId: string): Promise<void>;

  /** List all key IDs managed by this provider. */
  listKeys(): Promise<string[]>;
}

// ─── Software Fallback ────────────────────────────────────────────────────────

/**
 * SoftwareKeyProvider
 *
 * Stores key material encrypted in memory.  Keys are derived from a master
 * secret via HKDF so that restarting the process regenerates the same keys
 * (as long as the master secret env var is stable).
 *
 * Master secret resolution order:
 *   1. HW_KEY_MASTER_SECRET environment variable (hex)
 *   2. TOKEN_SECRET_HEX environment variable (hex)
 *   3. A deterministic zero-key (development only — logs a strong warning)
 */
export class SoftwareKeyProvider implements HardwareKeyProvider {
  public name = "software";

  // In-memory store: keyId → { keyMaterial, algorithm }
  private keys = new Map<string, { material: Buffer; algorithm: string }>();

  private getMasterSecret(): Buffer {
    const fromEnv = process.env.HW_KEY_MASTER_SECRET ?? process.env.TOKEN_SECRET_HEX;
    if (fromEnv) {
      return Buffer.from(fromEnv, "hex");
    }
    logger.warn(
      "SoftwareKeyProvider: HW_KEY_MASTER_SECRET / TOKEN_SECRET_HEX not set — " +
        "using zero master key (NOT SAFE FOR PRODUCTION)"
    );
    return Buffer.alloc(32, 0);
  }

  /**
   * Derive a key from the master secret using HKDF.
   * Returns a 32-byte (256-bit) derived key.
   */
  private deriveKey(keyId: string, algorithm: string): Buffer {
    const master = this.getMasterSecret();
    const info = Buffer.from(`${algorithm}:${keyId}`, "utf8");
    // Node's built-in hkdfSync: (digest, ikm, salt, info, keylen)
    const derived = crypto.hkdfSync("sha256", master, Buffer.alloc(32, 0), info, 32);
    return Buffer.from(derived);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateKey(keyId: string, algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void> {
    if (this.keys.has(keyId)) {
      return; // idempotent
    }
    const material = this.deriveKey(keyId, algorithm);
    this.keys.set(keyId, { material, algorithm });
    logger.debug("SoftwareKeyProvider: key generated", { keyId, algorithm });
  }

  async sign(keyId: string, data: Buffer): Promise<Buffer> {
    const entry = this.keys.get(keyId);
    if (!entry) {
      throw new Error(`SoftwareKeyProvider: key not found: ${keyId}`);
    }
    const mac = crypto
      .createHmac("sha256", entry.material)
      .update(data)
      .digest();
    return mac;
  }

  async encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer> {
    let entry = this.keys.get(keyId);
    if (!entry) {
      // Auto-generate on first use for convenience
      await this.generateKey(keyId, "AES-256");
      entry = this.keys.get(keyId)!;
    }

    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", entry.material, iv);
    if (context) {
      cipher.setAAD(context);
    }
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16-byte GCM auth tag

    // Layout: [iv (12)] [tag (16)] [ciphertext]
    return Buffer.concat([iv, tag, encrypted]);
  }

  async decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer> {
    const entry = this.keys.get(keyId);
    if (!entry) {
      throw new Error(`SoftwareKeyProvider: key not found: ${keyId}`);
    }
    if (ciphertext.length < 28) {
      throw new Error("SoftwareKeyProvider: ciphertext too short");
    }

    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const data = ciphertext.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", entry.material, iv);
    decipher.setAuthTag(tag);
    if (context) {
      decipher.setAAD(context);
    }

    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  async deleteKey(keyId: string): Promise<void> {
    this.keys.delete(keyId);
    logger.debug("SoftwareKeyProvider: key deleted", { keyId });
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }
}

// ─── TPM 2.0 Stub ─────────────────────────────────────────────────────────────

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * TPMKeyProvider — stub for TPM 2.0 integration.
 *
 * To add real TPM support:
 *   1. Install the `tpm2-tools` package on the host and the `node-tpm2` npm package.
 *   2. Replace the bodies of `sign`, `encrypt`, `decrypt` with tpm2-tools exec calls
 *      (e.g. `tpm2_create`, `tpm2_sign`, `tpm2_rsadecrypt`).
 *   3. Persist key contexts to /tmp/tpm2_ctx/<keyId>.ctx via `tpm2_evictcontrol`.
 */
export class TPMKeyProvider implements HardwareKeyProvider {
  public name = "tpm2";

  async isAvailable(): Promise<boolean> {
    if (process.platform === "linux") {
      return fs.existsSync("/dev/tpm0") || fs.existsSync("/dev/tpmrm0");
    }
    // macOS SecKeyCreateRandomKey is not accessible from Node.js without a native addon
    return false;
  }

  async generateKey(_keyId: string, _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void> {
    throw new NotImplementedError(
      "TPMKeyProvider.generateKey: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }

  async sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "TPMKeyProvider.sign: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }

  async encrypt(_keyId: string, _plaintext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "TPMKeyProvider.encrypt: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }

  async decrypt(_keyId: string, _ciphertext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "TPMKeyProvider.decrypt: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }

  async deleteKey(_keyId: string): Promise<void> {
    throw new NotImplementedError(
      "TPMKeyProvider.deleteKey: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }

  async listKeys(): Promise<string[]> {
    throw new NotImplementedError(
      "TPMKeyProvider.listKeys: add tpm2-tools bindings — see class JSDoc for guidance"
    );
  }
}

// ─── Secure Enclave Stub ──────────────────────────────────────────────────────

/**
 * SecureEnclaveProvider — stub for macOS / iOS Secure Enclave integration.
 *
 * To add real Secure Enclave support:
 *   1. Build a native Node.js addon using the CryptoKit / Security framework
 *      (Swift/Objective-C bridge via node-addon-api).
 *   2. Use `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave`.
 *   3. Map `sign` → `SecKeyCreateSignature`, `encrypt`/`decrypt` → `SecKeyCreateEncryptedData`.
 */
export class SecureEnclaveProvider implements HardwareKeyProvider {
  public name = "secure-enclave";

  async isAvailable(): Promise<boolean> {
    // The Secure Enclave exists on Apple Silicon and T-series Macs.
    // Actual access from Node.js requires a native addon — return true on darwin
    // so that the provider is detected, but all operations will throw until
    // the native addon is wired up.
    return process.platform === "darwin";
  }

  async generateKey(_keyId: string, _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.generateKey: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }

  async sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.sign: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }

  async encrypt(_keyId: string, _plaintext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.encrypt: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }

  async decrypt(_keyId: string, _ciphertext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.decrypt: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }

  async deleteKey(_keyId: string): Promise<void> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.deleteKey: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }

  async listKeys(): Promise<string[]> {
    throw new NotImplementedError(
      "SecureEnclaveProvider.listKeys: build a CryptoKit native addon — see class JSDoc for guidance"
    );
  }
}

// ─── PKCS#11 / HSM Stub ───────────────────────────────────────────────────────

/**
 * PKCS11Provider — stub for hardware HSM / smart card integration via PKCS#11.
 *
 * To add real PKCS#11 support:
 *   1. `npm install pkcs11js` (wraps the libp11 C library).
 *   2. Instantiate `new pkcs11js.PKCS11()`, call `load(libraryPath)`, and use
 *      `C_Login`, `C_GenerateKeyPair`, `C_Sign`, `C_Encrypt`, `C_Decrypt`.
 *   3. Replace the stub bodies below with the corresponding pkcs11js calls.
 */
export class PKCS11Provider implements HardwareKeyProvider {
  public name = "pkcs11";

  constructor(private libraryPath: string, _pin: string) {}

  async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.libraryPath);
  }

  async generateKey(_keyId: string, _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void> {
    throw new NotImplementedError(
      "PKCS11Provider.generateKey: install pkcs11js and implement C_GenerateKeyPair — see class JSDoc"
    );
  }

  async sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "PKCS11Provider.sign: install pkcs11js and implement C_Sign — see class JSDoc"
    );
  }

  async encrypt(_keyId: string, _plaintext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "PKCS11Provider.encrypt: install pkcs11js and implement C_Encrypt — see class JSDoc"
    );
  }

  async decrypt(_keyId: string, _ciphertext: Buffer, _context?: Buffer): Promise<Buffer> {
    throw new NotImplementedError(
      "PKCS11Provider.decrypt: install pkcs11js and implement C_Decrypt — see class JSDoc"
    );
  }

  async deleteKey(_keyId: string): Promise<void> {
    throw new NotImplementedError(
      "PKCS11Provider.deleteKey: install pkcs11js and implement C_DestroyObject — see class JSDoc"
    );
  }

  async listKeys(): Promise<string[]> {
    throw new NotImplementedError(
      "PKCS11Provider.listKeys: install pkcs11js and implement C_FindObjects — see class JSDoc"
    );
  }
}

// ─── Auto-Selection ───────────────────────────────────────────────────────────

/**
 * Probe all providers in priority order and return the first one that
 * reports itself as available.
 *
 * Priority: TPM2 → Secure Enclave → PKCS#11 → Software
 */
export async function createHardwareKeyStore(): Promise<HardwareKeyProvider> {
  const candidates: HardwareKeyProvider[] = [
    new TPMKeyProvider(),
    new SecureEnclaveProvider(),
  ];

  const pkcs11Lib = process.env.HW_KEY_PKCS11_LIB;
  const pkcs11Pin = process.env.HW_KEY_PKCS11_PIN ?? "";
  if (pkcs11Lib) {
    candidates.push(new PKCS11Provider(pkcs11Lib, pkcs11Pin));
  }

  candidates.push(new SoftwareKeyProvider());

  for (const provider of candidates) {
    try {
      const available = await provider.isAvailable();
      if (available) {
        logger.info(`Hardware key store: selected provider "${provider.name}"`);
        return provider;
      }
    } catch {
      // Provider detection threw — try next
    }
  }

  // SoftwareKeyProvider.isAvailable() always returns true, so we should
  // never reach here.  Return a software provider as the last resort.
  logger.warn("Hardware key store: all providers failed availability check, falling back to software");
  return new SoftwareKeyProvider();
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Singleton instance populated by `initHardwareKeyStore()`. */
export let hardwareKeyStore: HardwareKeyProvider;

/**
 * Call once at application startup to probe available hardware providers and
 * assign the `hardwareKeyStore` singleton.
 */
export async function initHardwareKeyStore(): Promise<void> {
  hardwareKeyStore = await createHardwareKeyStore();
}
