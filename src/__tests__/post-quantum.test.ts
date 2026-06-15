import { describe, it, expect } from "vitest";
import {
  createKEMProvider,
  generatePQKeyPair,
  hybridEncrypt,
  hybridDecrypt,
  NobleMLKEM,
} from "../crypto/post-quantum";

describe("Post-quantum KEM (real ML-KEM-768)", () => {
  it("selects the genuine noble ML-KEM provider, not the simulation", async () => {
    const provider = await createKEMProvider();
    expect(provider.name).toBe("noble-ml-kem");
    expect(provider.algorithm).toBe("ML-KEM-768");
  });

  it("produces real ML-KEM-768 key/ciphertext sizes", async () => {
    const provider = new NobleMLKEM();
    expect(await provider.isAvailable()).toBe(true);
    const { publicKey, privateKey } = await provider.generateKeyPair();
    expect(publicKey.keyData.length).toBe(1184); // ML-KEM-768 public key
    expect(privateKey.keyData.length).toBe(2400); // ML-KEM-768 secret key
    expect(publicKey.algorithm).toBe("ML-KEM-768");

    const { ciphertext, sharedSecret } = await provider.encapsulate(publicKey);
    expect(ciphertext.length).toBe(1088); // ML-KEM-768 ciphertext
    expect(sharedSecret.length).toBe(32);
  });

  it("encapsulate/decapsulate agree on the shared secret", async () => {
    const provider = await createKEMProvider();
    const { publicKey, privateKey } = await provider.generateKeyPair();
    const { ciphertext, sharedSecret } = await provider.encapsulate(publicKey);
    const recovered = await provider.decapsulate(privateKey, ciphertext);
    expect(recovered.equals(sharedSecret)).toBe(true);
  });

  it("hybridEncrypt → hybridDecrypt round-trips plaintext", async () => {
    const { publicKey, privateKey } = await (await createKEMProvider()).generateKeyPair();
    const message = Buffer.from("zero-trust secret payload");
    const { ciphertext, kemCiphertext } = await hybridEncrypt(publicKey, message);
    const decrypted = await hybridDecrypt(privateKey, kemCiphertext, ciphertext);
    expect(decrypted.equals(message)).toBe(true);
  });

  it("generatePQKeyPair reports the real ML-KEM-768 algorithm", async () => {
    const kp = await generatePQKeyPair();
    expect(kp.algorithm).toBe("ML-KEM-768");
    expect(kp.publicKeyHex.length).toBe(1184 * 2); // hex of 1184 bytes
  });
});
