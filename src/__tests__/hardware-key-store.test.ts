import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import { createHardwareKeyStore, SoftwareKeyProvider } from "../crypto/hardware-key-store";

describe("hardware key store provider selection", () => {
  const original = process.env.KEY_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.KEY_PROVIDER;
    else process.env.KEY_PROVIDER = original;
  });

  it("defaults to the software provider when KEY_PROVIDER is unset", async () => {
    delete process.env.KEY_PROVIDER;
    const provider = await createHardwareKeyStore();
    expect(provider.name).toBe("software");
    expect(provider).toBeInstanceOf(SoftwareKeyProvider);
  });

  it("selects software when KEY_PROVIDER=software", async () => {
    process.env.KEY_PROVIDER = "software";
    expect((await createHardwareKeyStore()).name).toBe("software");
  });

  it("selects software when KEY_PROVIDER=auto", async () => {
    process.env.KEY_PROVIDER = "auto";
    expect((await createHardwareKeyStore()).name).toBe("software");
  });

  it.each(["tpm", "tpm2", "secure-enclave", "pkcs11"])(
    "fails fast at startup when an unimplemented hardware provider is requested (%s)",
    async (selector) => {
      process.env.KEY_PROVIDER = selector;
      await expect(createHardwareKeyStore()).rejects.toThrow(/not implemented/i);
    }
  );

  it("rejects an unknown KEY_PROVIDER value", async () => {
    process.env.KEY_PROVIDER = "bogus";
    await expect(createHardwareKeyStore()).rejects.toThrow(/Unknown KEY_PROVIDER/);
  });

  it("software provider round-trips encrypt/decrypt", async () => {
    delete process.env.KEY_PROVIDER;
    const provider = await createHardwareKeyStore();
    const ciphertext = await provider.encrypt("k1", Buffer.from("secret"));
    const plaintext = await provider.decrypt("k1", ciphertext);
    expect(plaintext.toString()).toBe("secret");
  });
});
