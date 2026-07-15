/**
 * Hardware-backed key storage provider selection and singleton lifecycle.
 * Provider implementations live in ./hardware-key-store/.
 */

import { getLogger } from "../logger";
import { PKCS11Provider } from "./hardware-key-store/pkcs11.provider";
import { SecureEnclaveProvider, TPMKeyProvider } from "./hardware-key-store/platform.provider";
import { SoftwareKeyProvider } from "./hardware-key-store/software.provider";
import type { HardwareKeyProvider } from "./hardware-key-store/types";

export { PKCS11Provider } from "./hardware-key-store/pkcs11.provider";
export {
  SecureEnclaveProvider,
  TPMKeyProvider,
} from "./hardware-key-store/platform.provider";
export { SoftwareKeyProvider } from "./hardware-key-store/software.provider";
export type {
  HardwareKeyAlgorithm,
  HardwareKeyProvider,
} from "./hardware-key-store/types";

const logger = getLogger("hardware-key-store");
const UNIMPLEMENTED_HARDWARE_SELECTORS = new Set(["tpm", "tpm2", "secure-enclave"]);
const PKCS11_SELECTORS = new Set(["pkcs11", "hsm"]);

async function createPkcs11Provider(): Promise<HardwareKeyProvider> {
  const libraryPath = process.env.HW_KEY_PKCS11_LIB;
  const pin = process.env.HW_KEY_PKCS11_PIN ?? "";
  if (!libraryPath) {
    throw new Error("KEY_PROVIDER=pkcs11 requires HW_KEY_PKCS11_LIB (path to the PKCS#11 library)");
  }
  const provider = new PKCS11Provider(libraryPath, pin);
  if (!(await provider.isAvailable())) {
    throw new Error(
      "PKCS11Provider unavailable - install pkcs11js and ensure HW_KEY_PKCS11_LIB exists"
    );
  }
  return provider;
}

async function noteUnsupportedHardware(): Promise<void> {
  const probes: HardwareKeyProvider[] = [new TPMKeyProvider(), new SecureEnclaveProvider()];
  const pkcs11Lib = process.env.HW_KEY_PKCS11_LIB;
  if (pkcs11Lib) {
    probes.push(new PKCS11Provider(pkcs11Lib, process.env.HW_KEY_PKCS11_PIN ?? ""));
  }

  for (const probe of probes) {
    try {
      if (!(await probe.isAvailable())) continue;
      if (probe.name === "pkcs11") {
        logger.info(
          "Hardware key store: PKCS#11 library detected - set KEY_PROVIDER=pkcs11 to use it"
        );
      } else {
        logger.info(
          `Hardware key store: detected "${probe.name}" hardware, but it is not implemented; ` +
            "using the software provider"
        );
      }
    } catch {
      // Best-effort diagnostics must not prevent software fallback.
    }
  }
}

export async function createHardwareKeyStore(): Promise<HardwareKeyProvider> {
  const requested = (process.env.KEY_PROVIDER ?? "auto").trim().toLowerCase();

  if (UNIMPLEMENTED_HARDWARE_SELECTORS.has(requested)) {
    throw new Error(
      `KEY_PROVIDER="${requested}" requested, but TPM / Secure Enclave providers are not ` +
        "implemented. Use KEY_PROVIDER=software or KEY_PROVIDER=pkcs11."
    );
  }
  if (PKCS11_SELECTORS.has(requested)) {
    const provider = await createPkcs11Provider();
    logger.info(`Hardware key store: selected provider "${provider.name}"`);
    return provider;
  }
  if (requested !== "auto" && requested !== "software") {
    throw new Error(`Unknown KEY_PROVIDER="${requested}". Valid values: software, auto, pkcs11.`);
  }
  if (requested === "auto") await noteUnsupportedHardware();

  const provider = new SoftwareKeyProvider();
  logger.info(`Hardware key store: selected provider "${provider.name}"`);
  return provider;
}

let hardwareKeyStoreSingleton: HardwareKeyProvider | undefined;

export function getHardwareKeyStore(): HardwareKeyProvider {
  if (!hardwareKeyStoreSingleton) {
    throw new Error("Hardware key store not initialized. Call initHardwareKeyStore() during boot.");
  }
  return hardwareKeyStoreSingleton;
}

/** @deprecated Prefer getHardwareKeyStore(); retained for SDK compatibility. */
export let hardwareKeyStore: HardwareKeyProvider;

export async function initHardwareKeyStore(): Promise<void> {
  hardwareKeyStoreSingleton = await createHardwareKeyStore();
  hardwareKeyStore = hardwareKeyStoreSingleton;
}

export function resetHardwareKeyStore(): void {
  hardwareKeyStoreSingleton = undefined;
}
