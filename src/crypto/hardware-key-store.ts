/**
 * Hardware-Backed Key Storage Abstraction
 *
 * Provides a unified interface for TPM 2.0, Secure Enclave, PKCS#11 HSM, and
 * a software fallback that encrypts key material in memory using HKDF +
 * AES-256-GCM.
 *
 * ⚠️ This build is **software-only**: the TPM / Secure Enclave / PKCS#11
 * providers below are unimplemented skeletons (every operation throws
 * `NotImplementedError`). Wiring real hardware needs native addons / host
 * tooling — see each provider's JSDoc and the fork checklist in
 * `docs/extending.md` § Hardware-backed key store.
 *
 * Provider selection is controlled by the `KEY_PROVIDER` env var:
 *   - unset / `auto`     → software provider (the only functional one); logs an
 *                          informational notice if a TPM / Secure Enclave is
 *                          physically present but unsupported by this build.
 *   - `software`         → software provider.
 *   - `tpm` / `secure-enclave` / `pkcs11` → **fails fast at startup** with a
 *                          clear error, instead of silently selecting a stub
 *                          that throws on first crypto use.
 */

import crypto from "node:crypto";
import fs from "node:fs";
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
    const mac = crypto.createHmac("sha256", entry.material).update(data).digest();
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

  async generateKey(
    _keyId: string,
    _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"
  ): Promise<void> {
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

  async generateKey(
    _keyId: string,
    _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"
  ): Promise<void> {
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

  constructor(
    private libraryPath: string,
    _pin: string
  ) {}

  async isAvailable(): Promise<boolean> {
    return fs.existsSync(this.libraryPath);
  }

  async generateKey(
    _keyId: string,
    _algorithm: "PASETO" | "AES-256" | "ECDSA-P256"
  ): Promise<void> {
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

/** KEY_PROVIDER values that select an (unimplemented) hardware provider. */
const HARDWARE_PROVIDER_SELECTORS = new Set(["tpm", "tpm2", "secure-enclave", "pkcs11", "hsm"]);

/**
 * Probe the hardware providers purely to surface an informational log line when
 * a TPM / Secure Enclave / PKCS#11 device is physically present but unsupported
 * by this software-only build. Never selects them — they can't perform crypto.
 */
async function noteUnsupportedHardware(): Promise<void> {
  const probes: HardwareKeyProvider[] = [new TPMKeyProvider(), new SecureEnclaveProvider()];
  const pkcs11Lib = process.env.HW_KEY_PKCS11_LIB;
  if (pkcs11Lib) {
    probes.push(new PKCS11Provider(pkcs11Lib, process.env.HW_KEY_PKCS11_PIN ?? ""));
  }
  for (const probe of probes) {
    try {
      if (await probe.isAvailable()) {
        logger.info(
          `Hardware key store: detected "${probe.name}" hardware, but this build is ` +
            "software-only — using the software provider. A hardware implementation must " +
            "be wired up before KEY_PROVIDER can select it."
        );
      }
    } catch {
      // Detection threw — ignore; this is best-effort diagnostics only.
    }
  }
}

/**
 * Select the key-storage provider based on the `KEY_PROVIDER` env var.
 *
 * The software provider is the only functional one in this build. Explicitly
 * requesting a hardware provider throws at startup (fail-fast) rather than
 * returning a stub that would throw on the first sign/encrypt/decrypt call.
 */
export async function createHardwareKeyStore(): Promise<HardwareKeyProvider> {
  const requested = (process.env.KEY_PROVIDER ?? "auto").trim().toLowerCase();

  if (HARDWARE_PROVIDER_SELECTORS.has(requested)) {
    throw new Error(
      `KEY_PROVIDER="${requested}" requested, but hardware-backed key providers ` +
        "(TPM / Secure Enclave / PKCS#11) are not implemented in this build — every " +
        "operation would throw. Unset KEY_PROVIDER or set KEY_PROVIDER=software."
    );
  }

  if (requested !== "auto" && requested !== "software") {
    throw new Error(`Unknown KEY_PROVIDER="${requested}". Valid values: software, auto (default).`);
  }

  // In auto mode, emit a diagnostic if hardware is present but unsupported.
  if (requested === "auto") {
    await noteUnsupportedHardware();
  }

  const provider = new SoftwareKeyProvider();
  logger.info(`Hardware key store: selected provider "${provider.name}"`);
  return provider;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Singleton instance populated by `initHardwareKeyStore()`. */
let hardwareKeyStoreSingleton: HardwareKeyProvider | undefined;

/**
 * Return the boot-time key-store singleton.
 * @throws when `initHardwareKeyStore()` has not run.
 */
export function getHardwareKeyStore(): HardwareKeyProvider {
  if (!hardwareKeyStoreSingleton) {
    throw new Error("Hardware key store not initialized. Call initHardwareKeyStore() during boot.");
  }
  return hardwareKeyStoreSingleton;
}

/** @deprecated Prefer `getHardwareKeyStore()` — kept for SDK consumers. */
export let hardwareKeyStore: HardwareKeyProvider;

/**
 * Call once at application startup to probe available hardware providers and
 * assign the key-store singleton.
 */
export async function initHardwareKeyStore(): Promise<void> {
  hardwareKeyStoreSingleton = await createHardwareKeyStore();
  hardwareKeyStore = hardwareKeyStoreSingleton;
}

/** Reset singleton state (for tests). */
export function resetHardwareKeyStore(): void {
  hardwareKeyStoreSingleton = undefined;
}
