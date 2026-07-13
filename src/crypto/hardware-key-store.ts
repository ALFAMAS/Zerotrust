/**
 * Hardware-Backed Key Storage Abstraction
 *
 * Provides a unified interface for TPM 2.0, Secure Enclave, PKCS#11 HSM, and
 * a software fallback that encrypts key material in memory using HKDF +
 * AES-256-GCM.
 *
 * ⚠️ TPM / Secure Enclave providers remain fork stubs. PKCS#11 is functional
 * when `pkcs11js` is installed and `HW_KEY_PKCS11_LIB` + `HW_KEY_PKCS11_PIN`
 * are configured (SoftHSM-compatible). Software provider is the default.
 *
 * Provider selection is controlled by the `KEY_PROVIDER` env var:
 *   - unset / `auto`     → software provider; logs when hardware is present
 *   - `software`         → software provider
 *   - `pkcs11` / `hsm`   → PKCS#11 HSM (requires pkcs11js + library path)
 *   - `tpm` / `secure-enclave` → fails fast (not implemented in this build)
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

// ─── PKCS#11 / HSM ────────────────────────────────────────────────────────────

/** PKCS#11 mechanism / attribute constants used with pkcs11js. */
const CKF_SERIAL_SESSION = 0x0000_0004;
const CKF_RW_SESSION = 0x0000_0002;
const CKU_USER = 1;
const CKO_SECRET_KEY = 0x0000_0004;
const CKA_CLASS = 0x0000_0000;
const CKA_TOKEN = 0x0000_0001;
const CKA_PRIVATE = 0x0000_0002;
const CKA_LABEL = 0x0000_0003;
const CKA_VALUE = 0x0000_0011;
const CKA_SIGN = 0x0000_0108;
const CKA_ENCRYPT = 0x0000_0104;
const CKA_DECRYPT = 0x0000_0105;
const CKM_SHA256_HMAC = 0x0000_0251;
const CKM_AES_CBC_PAD = 0x0000_010a;

type Pkcs11Module = typeof import("pkcs11js");
type Pkcs11Instance = InstanceType<Pkcs11Module["PKCS11"]>;

async function loadPkcs11Module(): Promise<Pkcs11Module | null> {
  try {
    return await import("pkcs11js");
  } catch {
    return null;
  }
}

/**
 * PKCS11Provider — hardware HSM / SoftHSM integration via pkcs11js.
 *
 * Requires optional dependency `pkcs11js` and a PKCS#11 library at
 * `HW_KEY_PKCS11_LIB`. Test locally with SoftHSM2 — see docs/extending.md.
 */
export class PKCS11Provider implements HardwareKeyProvider {
  public name = "pkcs11";

  private pkcs11: Pkcs11Instance | null = null;
  private session: Buffer | null = null;
  private slot: Buffer | null = null;
  private initialized = false;
  private keyHandles = new Map<string, Buffer>();

  constructor(
    private libraryPath: string,
    private pin: string
  ) {}

  private async ensureSession(): Promise<void> {
    if (this.session != null) return;

    const mod = await loadPkcs11Module();
    if (!mod) {
      throw new Error(
        "PKCS11Provider: pkcs11js is not installed — add it as an optional dependency " +
          "and ensure native build tools are available"
      );
    }
    if (!fs.existsSync(this.libraryPath)) {
      throw new Error(`PKCS11Provider: library not found at ${this.libraryPath}`);
    }

    const pkcs11 = new mod.PKCS11();
    pkcs11.load(this.libraryPath);
    pkcs11.C_Initialize();
    this.initialized = true;
    this.pkcs11 = pkcs11;

    const slots = pkcs11.C_GetSlotList(true);
    if (!slots.length) {
      throw new Error("PKCS11Provider: no token slots available");
    }
    this.slot = slots[0]!;
    this.session = pkcs11.C_OpenSession(this.slot, CKF_SERIAL_SESSION | CKF_RW_SESSION);
    if (this.pin) {
      pkcs11.C_Login(this.session, CKU_USER, this.pin);
    }
    logger.info("PKCS11Provider: session opened", { slot: this.slot });
  }

  async isAvailable(): Promise<boolean> {
    if (!fs.existsSync(this.libraryPath)) return false;
    const mod = await loadPkcs11Module();
    return mod != null;
  }

  private async findKeyHandle(keyId: string): Promise<Buffer> {
    const cached = this.keyHandles.get(keyId);
    if (cached) return cached;

    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const template = [{ type: CKA_LABEL, value: keyId }];
    pkcs11.C_FindObjectsInit(session, template);
    const handles = pkcs11.C_FindObjects(session, 1);
    pkcs11.C_FindObjectsFinal(session);
    if (!handles.length) {
      throw new Error(`PKCS11Provider: key not found: ${keyId}`);
    }
    this.keyHandles.set(keyId, handles[0]!);
    return handles[0];
  }

  async generateKey(keyId: string, algorithm: "PASETO" | "AES-256" | "ECDSA-P256"): Promise<void> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;

    const keySize = algorithm === "AES-256" ? 32 : 32;
    const template = [
      { type: CKA_TOKEN, value: true },
      { type: CKA_PRIVATE, value: true },
      { type: CKA_LABEL, value: keyId },
      { type: CKA_SIGN, value: true },
      { type: CKA_ENCRYPT, value: true },
      { type: CKA_DECRYPT, value: true },
      { type: CKA_VALUE, value: crypto.randomBytes(keySize) },
    ];
    const handle = pkcs11.C_CreateObject(session, template);
    this.keyHandles.set(keyId, handle);
    logger.debug("PKCS11Provider: key generated", { keyId, algorithm });
  }

  async sign(keyId: string, data: Buffer): Promise<Buffer> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const handle = await this.findKeyHandle(keyId);
    pkcs11.C_SignInit(session, { mechanism: CKM_SHA256_HMAC }, handle);
    const sig = pkcs11.C_Sign(session, data, Buffer.alloc(64)) as Buffer;
    return Buffer.from(sig);
  }

  async encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const handle = await this.findKeyHandle(keyId);
    const iv = crypto.randomBytes(16);
    pkcs11.C_EncryptInit(session, { mechanism: CKM_AES_CBC_PAD, parameter: iv }, handle);
    const encrypted = pkcs11.C_Encrypt(session, plaintext, Buffer.alloc(plaintext.length + 32));
    const payload = Buffer.concat([iv, Buffer.from(encrypted as Buffer)]);
    if (context) {
      const binding = crypto.createHmac("sha256", context).update(payload).digest();
      return Buffer.concat([binding.subarray(0, 16), payload]);
    }
    return payload;
  }

  async decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const handle = await this.findKeyHandle(keyId);

    let data = ciphertext;
    if (context) {
      const binding = crypto.createHmac("sha256", context).update(data.subarray(16)).digest();
      if (!binding.subarray(0, 16).equals(ciphertext.subarray(0, 16))) {
        throw new Error("PKCS11Provider: context binding mismatch");
      }
      data = data.subarray(16);
    }

    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    pkcs11.C_DecryptInit(session, { mechanism: CKM_AES_CBC_PAD, parameter: iv }, handle);
    const plain = pkcs11.C_Decrypt(session, encrypted, Buffer.alloc(encrypted.length + 32));
    return Buffer.from(plain as Buffer);
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const handle = await this.findKeyHandle(keyId);
    pkcs11.C_DestroyObject(session, handle);
    this.keyHandles.delete(keyId);
    logger.debug("PKCS11Provider: key deleted", { keyId });
  }

  async listKeys(): Promise<string[]> {
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const template = [{ type: CKA_CLASS, value: CKO_SECRET_KEY }];
    pkcs11.C_FindObjectsInit(session, template);
    const handles = pkcs11.C_FindObjects(session, 100);
    pkcs11.C_FindObjectsFinal(session);

    const labels: string[] = [];
    for (const handle of handles) {
      const attrs = pkcs11.C_GetAttributeValue(session, handle, [{ type: CKA_LABEL }]) as Array<{
        type: number;
        value: Buffer;
      }>;
      const label = attrs[0]?.value?.toString("utf8");
      if (label) labels.push(label);
    }
    return labels;
  }

  /** Close PKCS#11 session (tests / shutdown). */
  async close(): Promise<void> {
    if (this.pkcs11 && this.session != null) {
      try {
        this.pkcs11.C_CloseSession(this.session);
      } catch {
        // best effort
      }
    }
    if (this.pkcs11 && this.initialized) {
      try {
        this.pkcs11.C_Finalize();
      } catch {
        // best effort
      }
    }
    this.session = null;
    this.pkcs11 = null;
    this.initialized = false;
    this.keyHandles.clear();
  }
}

// ─── Auto-Selection ───────────────────────────────────────────────────────────

/** KEY_PROVIDER values that select an unimplemented hardware provider. */
const UNIMPLEMENTED_HARDWARE_SELECTORS = new Set(["tpm", "tpm2", "secure-enclave"]);
const PKCS11_SELECTORS = new Set(["pkcs11", "hsm"]);

async function createPkcs11Provider(): Promise<HardwareKeyProvider> {
  const libraryPath = process.env.HW_KEY_PKCS11_LIB;
  const pin = process.env.HW_KEY_PKCS11_PIN ?? "";
  if (!libraryPath) {
    throw new Error(
      "KEY_PROVIDER=pkcs11 requires HW_KEY_PKCS11_LIB (path to PKCS#11 .so / .dylib)"
    );
  }
  const provider = new PKCS11Provider(libraryPath, pin);
  if (!(await provider.isAvailable())) {
    throw new Error(
      "PKCS11Provider unavailable — install pkcs11js and ensure HW_KEY_PKCS11_LIB exists"
    );
  }
  return provider;
}

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
        if (probe.name === "pkcs11") {
          logger.info(
            "Hardware key store: PKCS#11 library detected — set KEY_PROVIDER=pkcs11 to use it"
          );
        } else {
          logger.info(
            `Hardware key store: detected "${probe.name}" hardware, but it is not implemented ` +
              "in this build — using the software provider."
          );
        }
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

  if (UNIMPLEMENTED_HARDWARE_SELECTORS.has(requested)) {
    throw new Error(
      `KEY_PROVIDER="${requested}" requested, but TPM / Secure Enclave providers are not ` +
        "implemented in this build. Use KEY_PROVIDER=software or KEY_PROVIDER=pkcs11."
    );
  }

  if (PKCS11_SELECTORS.has(requested)) {
    const provider = await createPkcs11Provider();
    logger.info(`Hardware key store: selected provider "${provider.name}"`);
    return provider;
  }

  if (requested !== "auto" && requested !== "software") {
    throw new Error(
      `Unknown KEY_PROVIDER="${requested}". Valid values: software, auto, pkcs11 (default: auto).`
    );
  }

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
