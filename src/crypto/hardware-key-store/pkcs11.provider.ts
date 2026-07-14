import crypto from "node:crypto";
import fs from "node:fs";
import { getLogger } from "../../logger";
import type { HardwareKeyAlgorithm, HardwareKeyProvider } from "./types";

const logger = getLogger("hardware-key-store");
const CKF_SERIAL_SESSION = 0x0000_0004;
const CKF_RW_SESSION = 0x0000_0002;
const CKU_USER = 1;
const CKO_SECRET_KEY = 0x0000_0004;
const CKK_GENERIC_SECRET = 0x0000_0010;
const CKK_AES = 0x0000_001f;
const CKA_CLASS = 0x0000_0000;
const CKA_TOKEN = 0x0000_0001;
const CKA_PRIVATE = 0x0000_0002;
const CKA_LABEL = 0x0000_0003;
const CKA_KEY_TYPE = 0x0000_0100;
const CKA_SENSITIVE = 0x0000_0103;
const CKA_SIGN = 0x0000_0108;
const CKA_ENCRYPT = 0x0000_0104;
const CKA_DECRYPT = 0x0000_0105;
const CKA_VALUE_LEN = 0x0000_0161;
const CKA_EXTRACTABLE = 0x0000_0162;
const CKM_SHA256_HMAC = 0x0000_0251;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAC_LABEL_SUFFIX = ":mac";

type Pkcs11Module = typeof import("pkcs11js");
type Pkcs11Instance = InstanceType<Pkcs11Module["PKCS11"]>;
type Pkcs11Constants = Pick<
  Pkcs11Module,
  "CKM_AES_GCM" | "CKM_AES_KEY_GEN" | "CKM_GENERIC_SECRET_KEY_GEN" | "CK_PARAMS_GCM"
>;
type Pkcs11Runtime = { api: Pkcs11Instance; constants: Pkcs11Constants };
type Pkcs11RuntimeLoader = () => Promise<Pkcs11Runtime | null>;

async function loadPkcs11Runtime(): Promise<Pkcs11Runtime | null> {
  try {
    const mod = await import("pkcs11js");
    return {
      api: new mod.PKCS11(),
      constants: {
        CKM_AES_GCM: mod.CKM_AES_GCM,
        CKM_AES_KEY_GEN: mod.CKM_AES_KEY_GEN,
        CKM_GENERIC_SECRET_KEY_GEN: mod.CKM_GENERIC_SECRET_KEY_GEN,
        CK_PARAMS_GCM: mod.CK_PARAMS_GCM,
      },
    };
  } catch {
    return null;
  }
}

/** Hardware HSM / SoftHSM integration via the optional pkcs11js dependency. */
export class PKCS11Provider implements HardwareKeyProvider {
  public name = "pkcs11";
  private pkcs11: Pkcs11Instance | null = null;
  private session: Buffer | null = null;
  private slot: Buffer | null = null;
  private initialized = false;
  private constants: Pkcs11Constants | null = null;
  private keyHandles = new Map<string, Buffer>();

  constructor(
    private libraryPath: string,
    private pin: string,
    private runtimeLoader: Pkcs11RuntimeLoader = loadPkcs11Runtime
  ) {}

  private async ensureSession(): Promise<void> {
    if (this.session != null) return;
    const runtime = await this.runtimeLoader();
    if (!runtime) {
      throw new Error("PKCS11Provider: pkcs11js is not installed or failed to load");
    }
    if (!fs.existsSync(this.libraryPath)) {
      throw new Error(`PKCS11Provider: library not found at ${this.libraryPath}`);
    }

    const pkcs11 = runtime.api;
    pkcs11.load(this.libraryPath);
    pkcs11.C_Initialize();
    this.initialized = true;
    this.pkcs11 = pkcs11;
    this.constants = runtime.constants;
    const slots = pkcs11.C_GetSlotList(true);
    if (!slots.length) {
      pkcs11.C_Finalize();
      this.initialized = false;
      this.pkcs11 = null;
      this.constants = null;
      throw new Error("PKCS11Provider: no token slots available");
    }

    this.slot = slots[0]!;
    this.session = pkcs11.C_OpenSession(this.slot, CKF_SERIAL_SESSION | CKF_RW_SESSION);
    if (this.pin) pkcs11.C_Login(this.session, CKU_USER, this.pin);
    logger.info("PKCS11Provider: session opened", { slot: this.slot });
  }

  async isAvailable(): Promise<boolean> {
    if (!fs.existsSync(this.libraryPath)) return false;
    return (await this.runtimeLoader()) != null;
  }

  private async findKeyHandleOrNull(label: string): Promise<Buffer | null> {
    const cached = this.keyHandles.get(label);
    if (cached) return cached;
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    pkcs11.C_FindObjectsInit(session, [{ type: CKA_LABEL, value: label }]);
    try {
      const handle = pkcs11.C_FindObjects(session, 1)[0];
      if (!handle) return null;
      this.keyHandles.set(label, handle);
      return handle;
    } finally {
      pkcs11.C_FindObjectsFinal(session);
    }
  }

  private async findKeyHandle(label: string): Promise<Buffer> {
    const handle = await this.findKeyHandleOrNull(label);
    if (!handle) throw new Error(`PKCS11Provider: key not found: ${label}`);
    return handle;
  }

  async generateKey(keyId: string, algorithm: HardwareKeyAlgorithm): Promise<void> {
    if (algorithm === "ECDSA-P256") {
      throw new Error("PKCS11Provider: ECDSA-P256 is not implemented");
    }
    await this.ensureSession();
    const pkcs11 = this.pkcs11!;
    const session = this.session!;
    const constants = this.constants!;
    const baseTemplate = [
      { type: CKA_TOKEN, value: true },
      { type: CKA_PRIVATE, value: true },
      { type: CKA_SENSITIVE, value: true },
      { type: CKA_EXTRACTABLE, value: false },
    ];

    if (!(await this.findKeyHandleOrNull(keyId))) {
      const handle = pkcs11.C_GenerateKey(session, { mechanism: constants.CKM_AES_KEY_GEN }, [
        ...baseTemplate,
        { type: CKA_CLASS, value: CKO_SECRET_KEY },
        { type: CKA_KEY_TYPE, value: CKK_AES },
        { type: CKA_LABEL, value: keyId },
        { type: CKA_VALUE_LEN, value: 32 },
        { type: CKA_ENCRYPT, value: true },
        { type: CKA_DECRYPT, value: true },
      ]);
      this.keyHandles.set(keyId, handle);
    }

    const macLabel = `${keyId}${MAC_LABEL_SUFFIX}`;
    if (!(await this.findKeyHandleOrNull(macLabel))) {
      const handle = pkcs11.C_GenerateKey(
        session,
        { mechanism: constants.CKM_GENERIC_SECRET_KEY_GEN },
        [
          ...baseTemplate,
          { type: CKA_CLASS, value: CKO_SECRET_KEY },
          { type: CKA_KEY_TYPE, value: CKK_GENERIC_SECRET },
          { type: CKA_LABEL, value: macLabel },
          { type: CKA_VALUE_LEN, value: 32 },
          { type: CKA_SIGN, value: true },
        ]
      );
      this.keyHandles.set(macLabel, handle);
    }
    logger.debug("PKCS11Provider: key generated", { keyId, algorithm });
  }

  async sign(keyId: string, data: Buffer): Promise<Buffer> {
    await this.ensureSession();
    const handle = await this.findKeyHandle(`${keyId}${MAC_LABEL_SUFFIX}`);
    this.pkcs11!.C_SignInit(this.session!, { mechanism: CKM_SHA256_HMAC }, handle);
    return Buffer.from(this.pkcs11!.C_Sign(this.session!, data, Buffer.alloc(64)));
  }

  async encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer> {
    await this.ensureSession();
    const iv = crypto.randomBytes(IV_BYTES);
    const handle = await this.findKeyHandle(keyId);
    this.pkcs11!.C_EncryptInit(this.session!, this.gcmMechanism(iv, context), handle);
    const encrypted = this.pkcs11!.C_Encrypt(
      this.session!,
      plaintext,
      Buffer.alloc(plaintext.length + 32)
    );
    return Buffer.concat([iv, Buffer.from(encrypted)]);
  }

  async decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer> {
    await this.ensureSession();
    if (ciphertext.length < IV_BYTES + TAG_BYTES) {
      throw new Error("PKCS11Provider: ciphertext too short");
    }
    const handle = await this.findKeyHandle(keyId);
    const encrypted = ciphertext.subarray(IV_BYTES);
    this.pkcs11!.C_DecryptInit(
      this.session!,
      this.gcmMechanism(ciphertext.subarray(0, IV_BYTES), context),
      handle
    );
    return Buffer.from(
      this.pkcs11!.C_Decrypt(this.session!, encrypted, Buffer.alloc(encrypted.length + 32))
    );
  }

  private gcmMechanism(iv: Buffer, context?: Buffer) {
    const constants = this.constants!;
    return {
      mechanism: constants.CKM_AES_GCM,
      parameter: {
        type: constants.CK_PARAMS_GCM,
        iv,
        ivBits: IV_BYTES * 8,
        aad: context ?? Buffer.alloc(0),
        tagBits: TAG_BYTES * 8,
      },
    };
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.ensureSession();
    for (const label of [keyId, `${keyId}${MAC_LABEL_SUFFIX}`]) {
      const handle = await this.findKeyHandleOrNull(label);
      if (handle) this.pkcs11!.C_DestroyObject(this.session!, handle);
      this.keyHandles.delete(label);
    }
    logger.debug("PKCS11Provider: key deleted", { keyId });
  }

  async listKeys(): Promise<string[]> {
    await this.ensureSession();
    this.pkcs11!.C_FindObjectsInit(this.session!, [{ type: CKA_CLASS, value: CKO_SECRET_KEY }]);
    let handles: Buffer[];
    try {
      handles = this.pkcs11!.C_FindObjects(this.session!, 100);
    } finally {
      this.pkcs11!.C_FindObjectsFinal(this.session!);
    }
    const labels: string[] = [];
    for (const handle of handles) {
      const value = this.pkcs11!.C_GetAttributeValue(this.session!, handle, [
        { type: CKA_LABEL },
      ])[0]?.value;
      const label = Buffer.isBuffer(value) ? value.toString("utf8") : value?.toString();
      if (label && !label.endsWith(MAC_LABEL_SUFFIX)) labels.push(label);
    }
    return labels;
  }

  async close(): Promise<void> {
    if (this.pkcs11 && this.session != null) {
      try {
        this.pkcs11.C_CloseSession(this.session);
      } catch {}
    }
    if (this.pkcs11 && this.initialized) {
      try {
        this.pkcs11.C_Finalize();
      } catch {}
    }
    this.session = null;
    this.slot = null;
    this.pkcs11 = null;
    this.constants = null;
    this.initialized = false;
    this.keyHandles.clear();
  }
}
