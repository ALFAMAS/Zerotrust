import crypto from "crypto";

export interface KEMPublicKey {
  algorithm: "ML-KEM-768" | "ML-KEM-1024" | "X25519-ML-KEM-768";
  keyData: Buffer;
}

export interface KEMPrivateKey {
  algorithm: string;
  keyData: Buffer;
  publicKey: KEMPublicKey;
}

export interface KEMEncapsulation {
  ciphertext: Buffer;
  sharedSecret: Buffer;
}

export interface PQKEMProvider {
  name: string;
  algorithm: string;
  isAvailable(): Promise<boolean>;
  generateKeyPair(): Promise<{ publicKey: KEMPublicKey; privateKey: KEMPrivateKey }>;
  encapsulate(publicKey: KEMPublicKey): Promise<KEMEncapsulation>;
  decapsulate(privateKey: KEMPrivateKey, ciphertext: Buffer): Promise<Buffer>;
}

// Software simulation using ECDH P-256 — same API, not quantum-safe
export class SimulatedMLKEM implements PQKEMProvider {
  name = "simulated-ml-kem";
  algorithm = "ML-KEM-768-SIM";

  async isAvailable(): Promise<boolean> { return true; }

  async generateKeyPair(): Promise<{ publicKey: KEMPublicKey; privateKey: KEMPrivateKey }> {
    const { privateKey: privKey, publicKey: pubKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pubDer = pubKey.export({ type: "spki", format: "der" }) as Buffer;
    const privDer = privKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    const publicKey: KEMPublicKey = { algorithm: "ML-KEM-768", keyData: pubDer };
    const privateKey: KEMPrivateKey = { algorithm: this.algorithm, keyData: privDer, publicKey };
    return { publicKey, privateKey };
  }

  async encapsulate(publicKey: KEMPublicKey): Promise<KEMEncapsulation> {
    const { privateKey: ephPriv, publicKey: ephPub } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const recipientPub = crypto.createPublicKey({ key: publicKey.keyData, format: "der", type: "spki" });
    const sharedSecret = crypto.diffieHellman({ privateKey: ephPriv, publicKey: recipientPub });
    const ciphertext = ephPub.export({ type: "spki", format: "der" }) as Buffer;
    return { ciphertext, sharedSecret: Buffer.from(sharedSecret).subarray(0, 32) };
  }

  async decapsulate(privateKey: KEMPrivateKey, ciphertext: Buffer): Promise<Buffer> {
    const priv = crypto.createPrivateKey({ key: privateKey.keyData, format: "der", type: "pkcs8" });
    const ephPub = crypto.createPublicKey({ key: ciphertext, format: "der", type: "spki" });
    const sharedSecret = crypto.diffieHellman({ privateKey: priv, publicKey: ephPub });
    return Buffer.from(sharedSecret).subarray(0, 32);
  }
}

// Stub for @noble/post-quantum when installed
export class NobleMLKEM implements PQKEMProvider {
  name = "noble-ml-kem";
  algorithm = "ML-KEM-768";

  async isAvailable(): Promise<boolean> {
    try { require("@noble/post-quantum/ml-kem"); return true; } catch { return false; }
  }

  async generateKeyPair(): Promise<never> {
    throw new Error("Install @noble/post-quantum: npm install @noble/post-quantum");
  }

  async encapsulate(): Promise<never> {
    throw new Error("Install @noble/post-quantum: npm install @noble/post-quantum");
  }

  async decapsulate(): Promise<never> {
    throw new Error("Install @noble/post-quantum: npm install @noble/post-quantum");
  }
}

export async function createKEMProvider(): Promise<PQKEMProvider> {
  const noble = new NobleMLKEM();
  if (await noble.isAvailable()) return noble;
  return new SimulatedMLKEM();
}

export async function generatePQKeyPair(): Promise<{ publicKeyHex: string; privateKeyHex: string; algorithm: string }> {
  const provider = await createKEMProvider();
  const { publicKey, privateKey } = await provider.generateKeyPair();
  return {
    publicKeyHex: publicKey.keyData.toString("hex"),
    privateKeyHex: privateKey.keyData.toString("hex"),
    algorithm: provider.algorithm,
  };
}

export async function hybridEncrypt(
  publicKey: KEMPublicKey,
  plaintext: Buffer
): Promise<{ ciphertext: Buffer; kemCiphertext: Buffer }> {
  const provider = await createKEMProvider();
  const { ciphertext: kemCiphertext, sharedSecret } = await provider.encapsulate(publicKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sharedSecret, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext, kemCiphertext };
}

export async function hybridDecrypt(
  privateKey: KEMPrivateKey,
  kemCiphertext: Buffer,
  ciphertext: Buffer
): Promise<Buffer> {
  const provider = await createKEMProvider();
  const sharedSecret = await provider.decapsulate(privateKey, kemCiphertext);
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const encrypted = ciphertext.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", sharedSecret, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function establishPQSessionKey(
  serverPrivateKey: KEMPrivateKey,
  clientCiphertext: Buffer
): Promise<Buffer> {
  const provider = await createKEMProvider();
  return provider.decapsulate(serverPrivateKey, clientCiphertext);
}
