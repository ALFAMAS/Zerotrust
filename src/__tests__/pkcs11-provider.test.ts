import crypto from "node:crypto";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PKCS11Provider } from "../crypto/hardware-key-store";

const CKA_CLASS = 0x0000_0000;
const CKA_TOKEN = 0x0000_0001;
const CKA_PRIVATE = 0x0000_0002;
const CKA_LABEL = 0x0000_0003;
const CKA_VALUE = 0x0000_0011;
const CKA_SENSITIVE = 0x0000_0103;
const CKA_EXTRACTABLE = 0x0000_0162;

type Attribute = { type: number; value?: number | boolean | string | Buffer };
type GcmParams = { iv: Buffer; aad?: Buffer; tagBits: number };

class FakePkcs11Token {
  readonly generated: Array<{ mechanism: number; template: Attribute[] }> = [];
  readonly created: Attribute[][] = [];

  private nextHandle = 1;
  private keys = new Map<string, Buffer>();
  private labels = new Map<string, string>();
  private searchLabel: string | undefined;
  private activeKey: Buffer | undefined;
  private activeGcm: GcmParams | undefined;

  load() {}
  C_Initialize() {}
  C_Finalize() {}
  C_GetSlotList() {
    return [Buffer.from([1])];
  }
  C_OpenSession() {
    return Buffer.from([2]);
  }
  C_CloseSession() {}
  C_Login() {}

  C_CreateObject(_session: Buffer, template: Attribute[]) {
    this.created.push(template);
    throw new Error("C_CreateObject must not import raw key material");
  }

  C_GenerateKey(_session: Buffer, mechanism: { mechanism: number }, template: Attribute[]) {
    const label = String(template.find((attribute) => attribute.type === CKA_LABEL)?.value);
    const handle = Buffer.alloc(4);
    handle.writeUInt32BE(this.nextHandle++);
    this.keys.set(handle.toString("hex"), crypto.randomBytes(32));
    this.labels.set(handle.toString("hex"), label);
    this.generated.push({ mechanism: mechanism.mechanism, template });
    return handle;
  }

  C_FindObjectsInit(_session: Buffer, template: Attribute[]) {
    this.searchLabel = template.find((attribute) => attribute.type === CKA_LABEL)?.value as string;
  }
  C_FindObjects(_session: Buffer, max: number) {
    return [...this.labels.entries()]
      .filter(([, label]) => this.searchLabel === undefined || label === this.searchLabel)
      .slice(0, max)
      .map(([handle]) => Buffer.from(handle, "hex"));
  }
  C_FindObjectsFinal() {
    this.searchLabel = undefined;
  }
  C_GetAttributeValue(_session: Buffer, handle: Buffer) {
    return [{ type: CKA_LABEL, value: Buffer.from(this.labels.get(handle.toString("hex")) ?? "") }];
  }
  C_DestroyObject(_session: Buffer, handle: Buffer) {
    this.keys.delete(handle.toString("hex"));
    this.labels.delete(handle.toString("hex"));
  }

  C_SignInit(_session: Buffer, _mechanism: unknown, handle: Buffer) {
    this.activeKey = this.key(handle);
  }
  C_Sign(_session: Buffer, data: Buffer) {
    return crypto.createHmac("sha256", this.activeKey!).update(data).digest();
  }

  C_EncryptInit(_session: Buffer, mechanism: { parameter: GcmParams }, handle: Buffer) {
    this.activeKey = this.key(handle);
    this.activeGcm = mechanism.parameter;
  }
  C_Encrypt(_session: Buffer, plaintext: Buffer) {
    const cipher = crypto.createCipheriv("aes-256-gcm", this.activeKey!, this.activeGcm!.iv);
    cipher.setAAD(this.activeGcm!.aad ?? Buffer.alloc(0));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([ciphertext, cipher.getAuthTag()]);
  }

  C_DecryptInit(_session: Buffer, mechanism: { parameter: GcmParams }, handle: Buffer) {
    this.activeKey = this.key(handle);
    this.activeGcm = mechanism.parameter;
  }
  C_Decrypt(_session: Buffer, encrypted: Buffer) {
    const ciphertext = encrypted.subarray(0, -16);
    const tag = encrypted.subarray(-16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.activeKey!, this.activeGcm!.iv);
    decipher.setAAD(this.activeGcm!.aad ?? Buffer.alloc(0));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private key(handle: Buffer): Buffer {
    const key = this.keys.get(handle.toString("hex"));
    if (!key) throw new Error("key not found");
    return key;
  }
}

function createProvider(token: FakePkcs11Token) {
  const runtime = {
    api: token,
    constants: {
      CKM_AES_GCM: 0x1087,
      CKM_AES_KEY_GEN: 0x1080,
      CKM_GENERIC_SECRET_KEY_GEN: 0x0350,
      CK_PARAMS_GCM: 0x0003,
    },
  };
  return new PKCS11Provider("/virtual/libpkcs11.so", "1234", async () => runtime as never);
}

describe("PKCS11Provider hardened operations (CRYPTO-2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates non-extractable encryption and signing keys inside the token", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const token = new FakePkcs11Token();
    const provider = createProvider(token);

    await provider.generateKey("customer-key", "AES-256");

    expect(token.created).toHaveLength(0);
    expect(token.generated).toHaveLength(2);
    for (const { template } of token.generated) {
      expect(template).not.toContainEqual(expect.objectContaining({ type: CKA_VALUE }));
      expect(template).toContainEqual({ type: CKA_CLASS, value: 0x0000_0004 });
      expect(template).toContainEqual({ type: CKA_TOKEN, value: true });
      expect(template).toContainEqual({ type: CKA_PRIVATE, value: true });
      expect(template).toContainEqual({ type: CKA_SENSITIVE, value: true });
      expect(template).toContainEqual({ type: CKA_EXTRACTABLE, value: false });
    }
  });

  it("round-trips AES-256-GCM with AAD and rejects tampering", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const provider = createProvider(new FakePkcs11Token());
    await provider.generateKey("customer-key", "AES-256");

    const context = Buffer.from("org:123");
    const encrypted = await provider.encrypt("customer-key", Buffer.from("classified"), context);

    await expect(provider.decrypt("customer-key", encrypted, context)).resolves.toEqual(
      Buffer.from("classified")
    );

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    await expect(provider.decrypt("customer-key", tampered, context)).rejects.toThrow();
    await expect(
      provider.decrypt("customer-key", encrypted, Buffer.from("org:456"))
    ).rejects.toThrow();
  });

  it("rejects unsupported ECDSA generation instead of creating a symmetric key", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const token = new FakePkcs11Token();
    const provider = createProvider(token);

    await expect(provider.generateKey("signing-key", "ECDSA-P256")).rejects.toThrow(
      /ECDSA-P256.*not implemented/i
    );
    expect(token.generated).toHaveLength(0);
  });
});
