import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import {
  PKCS11Provider,
  SecureEnclaveProvider,
  SoftwareKeyProvider,
  TPMKeyProvider,
  createHardwareKeyStore,
  getHardwareKeyStore,
  initHardwareKeyStore,
  resetHardwareKeyStore,
} from "../crypto/hardware-key-store";

describe("hardware key store provider selection", () => {
  const original = process.env.KEY_PROVIDER;
  afterEach(() => {
    resetHardwareKeyStore();
    if (original === undefined) delete process.env.KEY_PROVIDER;
    else process.env.KEY_PROVIDER = original;
  });

  it("getHardwareKeyStore throws before init", () => {
    expect(() => getHardwareKeyStore()).toThrow(/not initialized/i);
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

  it.each(["tpm", "tpm2", "secure-enclave"])(
    "fails fast at startup when an unimplemented hardware provider is requested (%s)",
    async (selector) => {
      process.env.KEY_PROVIDER = selector;
      await expect(createHardwareKeyStore()).rejects.toThrow(/not implemented/i);
    }
  );

  it("fails when pkcs11 is requested without HW_KEY_PKCS11_LIB", async () => {
    delete process.env.HW_KEY_PKCS11_LIB;
    process.env.KEY_PROVIDER = "pkcs11";
    await expect(createHardwareKeyStore()).rejects.toThrow(/HW_KEY_PKCS11_LIB/);
  });

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

  it("software provider round-trips encrypt/decrypt with AAD context", async () => {
    delete process.env.KEY_PROVIDER;
    const provider = await createHardwareKeyStore();
    const context = Buffer.from("binding-context");
    const ciphertext = await provider.encrypt("k2", Buffer.from("bound"), context);
    const plaintext = await provider.decrypt("k2", ciphertext, context);
    expect(plaintext.toString()).toBe("bound");
  });

  it("software provider sign returns deterministic HMAC for a stable key", async () => {
    const provider = new SoftwareKeyProvider();
    await provider.generateKey("sign-key", "AES-256");
    const data = Buffer.from("payload");
    const sig1 = await provider.sign("sign-key", data);
    const sig2 = await provider.sign("sign-key", data);
    expect(sig1.equals(sig2)).toBe(true);
    expect(sig1.length).toBe(32);
  });

  it("initHardwareKeyStore assigns the singleton for getHardwareKeyStore", async () => {
    delete process.env.KEY_PROVIDER;
    await initHardwareKeyStore();
    expect(getHardwareKeyStore().name).toBe("software");
  });
});

describe("hardware provider stubs", () => {
  it("TPMKeyProvider reports availability on Linux when /dev/tpm0 exists", async () => {
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((path) => {
      return String(path) === "/dev/tpm0";
    });
    const provider = new TPMKeyProvider();
    expect(await provider.isAvailable()).toBe(process.platform === "linux");
    existsSpy.mockRestore();
  });

  it("SecureEnclaveProvider reports available only on darwin", async () => {
    const provider = new SecureEnclaveProvider();
    expect(await provider.isAvailable()).toBe(process.platform === "darwin");
  });

  it("PKCS11Provider reports unavailable when library path is missing", async () => {
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const provider = new PKCS11Provider("/missing/libpkcs11.so", "pin");
    expect(await provider.isAvailable()).toBe(false);
    existsSpy.mockRestore();
  });

  it.each([
    [TPMKeyProvider, "generateKey"],
    [SecureEnclaveProvider, "sign"],
  ] as const)("stub %s.%s throws NotImplementedError", async (Ctor, method) => {
    const provider = new Ctor();
    const op = provider[method as keyof typeof provider] as (...args: unknown[]) => Promise<unknown>;
    const args =
      method === "generateKey"
        ? ["kid", "AES-256"]
        : method === "sign"
          ? ["kid", Buffer.from("data")]
          : ["kid", Buffer.from("plain")];
    await expect(op(...args)).rejects.toMatchObject({ name: "NotImplementedError" });
  });
});
