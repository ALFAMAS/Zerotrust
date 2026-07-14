import crypto from "node:crypto";
import { getLogger } from "../../logger";
import type { HardwareKeyAlgorithm, HardwareKeyProvider } from "./types";

const logger = getLogger("hardware-key-store");

/** Software fallback that derives per-ID keys and keeps them in process memory. */
export class SoftwareKeyProvider implements HardwareKeyProvider {
  public name = "software";
  private keys = new Map<string, { material: Buffer; algorithm: string }>();

  private getMasterSecret(): Buffer {
    const fromEnv = process.env.HW_KEY_MASTER_SECRET ?? process.env.TOKEN_SECRET_HEX;
    if (fromEnv) return Buffer.from(fromEnv, "hex");

    logger.warn(
      "SoftwareKeyProvider: HW_KEY_MASTER_SECRET / TOKEN_SECRET_HEX not set - " +
        "using zero master key (NOT SAFE FOR PRODUCTION)"
    );
    return Buffer.alloc(32, 0);
  }

  private deriveKey(keyId: string, algorithm: string): Buffer {
    const info = Buffer.from(`${algorithm}:${keyId}`, "utf8");
    const derived = crypto.hkdfSync(
      "sha256",
      this.getMasterSecret(),
      Buffer.alloc(32, 0),
      info,
      32
    );
    return Buffer.from(derived);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateKey(keyId: string, algorithm: HardwareKeyAlgorithm): Promise<void> {
    if (this.keys.has(keyId)) return;
    this.keys.set(keyId, { material: this.deriveKey(keyId, algorithm), algorithm });
    logger.debug("SoftwareKeyProvider: key generated", { keyId, algorithm });
  }

  async sign(keyId: string, data: Buffer): Promise<Buffer> {
    const entry = this.keys.get(keyId);
    if (!entry) throw new Error(`SoftwareKeyProvider: key not found: ${keyId}`);
    return crypto.createHmac("sha256", entry.material).update(data).digest();
  }

  async encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer> {
    let entry = this.keys.get(keyId);
    if (!entry) {
      await this.generateKey(keyId, "AES-256");
      entry = this.keys.get(keyId)!;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", entry.material, iv);
    if (context) cipher.setAAD(context);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  async decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer> {
    const entry = this.keys.get(keyId);
    if (!entry) throw new Error(`SoftwareKeyProvider: key not found: ${keyId}`);
    if (ciphertext.length < 28) throw new Error("SoftwareKeyProvider: ciphertext too short");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      entry.material,
      ciphertext.subarray(0, 12)
    );
    decipher.setAuthTag(ciphertext.subarray(12, 28));
    if (context) decipher.setAAD(context);
    return Buffer.concat([decipher.update(ciphertext.subarray(28)), decipher.final()]);
  }

  async deleteKey(keyId: string): Promise<void> {
    this.keys.delete(keyId);
    logger.debug("SoftwareKeyProvider: key deleted", { keyId });
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }
}
