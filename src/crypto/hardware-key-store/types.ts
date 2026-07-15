export type HardwareKeyAlgorithm = "PASETO" | "AES-256" | "ECDSA-P256";

export interface HardwareKeyProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generateKey(keyId: string, algorithm: HardwareKeyAlgorithm): Promise<void>;
  sign(keyId: string, data: Buffer): Promise<Buffer>;
  decrypt(keyId: string, ciphertext: Buffer, context?: Buffer): Promise<Buffer>;
  encrypt(keyId: string, plaintext: Buffer, context?: Buffer): Promise<Buffer>;
  deleteKey(keyId: string): Promise<void>;
  listKeys(): Promise<string[]>;
}
