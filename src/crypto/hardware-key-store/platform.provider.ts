import fs from "node:fs";
import type { HardwareKeyAlgorithm, HardwareKeyProvider } from "./types";

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

function unsupported(operation: string): never {
  throw new NotImplementedError(
    `Hardware key provider ${operation}: native provider not implemented`
  );
}

abstract class PlatformKeyProvider implements HardwareKeyProvider {
  abstract name: string;
  abstract isAvailable(): Promise<boolean>;

  async generateKey(_keyId: string, _algorithm: HardwareKeyAlgorithm): Promise<void> {
    unsupported("generateKey");
  }

  async sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    return unsupported("sign");
  }

  async encrypt(_keyId: string, _plaintext: Buffer, _context?: Buffer): Promise<Buffer> {
    return unsupported("encrypt");
  }

  async decrypt(_keyId: string, _ciphertext: Buffer, _context?: Buffer): Promise<Buffer> {
    return unsupported("decrypt");
  }

  async deleteKey(_keyId: string): Promise<void> {
    unsupported("deleteKey");
  }

  async listKeys(): Promise<string[]> {
    return unsupported("listKeys");
  }
}

export class TPMKeyProvider extends PlatformKeyProvider {
  public name = "tpm2";

  async isAvailable(): Promise<boolean> {
    return (
      process.platform === "linux" && (fs.existsSync("/dev/tpm0") || fs.existsSync("/dev/tpmrm0"))
    );
  }
}

export class SecureEnclaveProvider extends PlatformKeyProvider {
  public name = "secure-enclave";

  async isAvailable(): Promise<boolean> {
    return process.platform === "darwin";
  }
}
