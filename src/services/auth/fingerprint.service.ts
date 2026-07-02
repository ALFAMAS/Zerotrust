import { UAParser } from "ua-parser-js";
import type { DeviceFingerprint } from "../../shared/types";

export interface FingerprintInput {
  userAgent: string;
  ip: string;
  acceptLanguage?: string;
  screenResolution?: string;
  timezone?: string;
  platform?: string;
}

// biome-ignore lint/complexity/noStaticOnlyClass: intentional namespace for fingerprint helpers; consumed as FingerprintService.* across the codebase
export class FingerprintService {
  static compute(
    input: FingerprintInput
  ): Omit<DeviceFingerprint, "isTrusted" | "firstSeenAt" | "lastSeenAt"> {
    const parser = new UAParser(input.userAgent);
    const result = parser.getResult();

    const components = [
      result.browser.name ?? "unknown",
      result.browser.major ?? "0",
      result.os.name ?? "unknown",
      result.os.version ?? "0",
      result.device.type ?? "desktop",
      input.timezone ?? "",
      input.screenResolution ?? "",
      input.acceptLanguage ?? "",
    ];

    const raw = components.join("|");
    const hash = FingerprintService.hashString(raw);

    const browserStr =
      `${result.browser.name ?? ""} ${result.browser.major ?? ""}`.trim() || "unknown";
    const osStr = `${result.os.name ?? ""} ${result.os.version ?? ""}`.trim() || "unknown";
    return {
      hash,
      platform: result.device.type ?? "desktop",
      browser: browserStr,
      os: osStr,
      screen: input.screenResolution,
      timezone: input.timezone,
      languages: input.acceptLanguage
        ? input.acceptLanguage.split(",").map((l) => l.split(";")[0].trim())
        : [],
    };
  }

  private static hashString(input: string): string {
    // FNV-1a 64-bit (fast, deterministic, no crypto needed for fingerprint)
    let hash = BigInt("0xcbf29ce484222325");
    const prime = BigInt("0x100000001b3");
    for (let i = 0; i < input.length; i++) {
      hash ^= BigInt(input.charCodeAt(i));
      hash = (hash * prime) & BigInt("0xFFFFFFFFFFFFFFFF");
    }
    return hash.toString(16).padStart(16, "0");
  }

  static extractFromRequest(req: {
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
  }): FingerprintInput {
    const get = (key: string): string => {
      const v = req.headers[key];
      return Array.isArray(v) ? v[0] : (v ?? "");
    };

    return {
      userAgent: get("user-agent"),
      ip: req.ip ?? get("x-forwarded-for").split(",")[0].trim(),
      acceptLanguage: get("accept-language"),
      screenResolution: get("x-screen-resolution"),
      timezone: get("x-timezone"),
      platform: get("x-platform"),
    };
  }
}
