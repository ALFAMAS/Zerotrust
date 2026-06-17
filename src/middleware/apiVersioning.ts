import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";

/**
 * API versioning: clients select a version via the `X-API-Version` header (or a
 * `/v{N}` path prefix); the default is the current version. Deprecated versions
 * still work but get standard `Deprecation` + `Sunset` + `Link` (successor)
 * response headers (RFC 8594 / draft-deprecation-header). Versions past their
 * sunset date are refused with 410 Gone.
 *
 * Routes aren't physically split by version yet — this establishes the
 * negotiation + lifecycle contract so versioned behavior can be layered in
 * without breaking existing clients.
 */
export type VersionStatus = "current" | "deprecated" | "sunset";

export interface ApiVersion {
  version: string; // e.g. "v1"
  status: VersionStatus;
  /** ISO date the version stops working (deprecated/sunset versions). */
  sunsetDate?: string;
  /** Version clients should migrate to. */
  successor?: string;
}

// Ordered registry; the last "current" entry is the default.
export const API_VERSIONS: ApiVersion[] = [{ version: "v1", status: "current" }];

export const CURRENT_API_VERSION =
  [...API_VERSIONS].reverse().find((v) => v.status === "current")?.version ??
  API_VERSIONS[API_VERSIONS.length - 1]?.version ??
  "v1";

export function findVersion(version: string): ApiVersion | undefined {
  return API_VERSIONS.find((v) => v.version === version.toLowerCase());
}

/** Resolve the requested version from a path prefix or the X-API-Version header. */
export function resolveRequestedVersion(path: string, header?: string | null): string {
  const fromPath = path.match(/^\/(v\d+)(\/|$)/i)?.[1];
  if (fromPath) return fromPath.toLowerCase();
  if (header) return header.trim().toLowerCase();
  return CURRENT_API_VERSION;
}

export function apiVersioning() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const requested = resolveRequestedVersion(c.req.path, c.req.header("x-api-version"));
    const known = findVersion(requested);

    // Unknown explicit version → fall through as current, but signal which is current.
    if (!known) {
      c.header("X-API-Version", CURRENT_API_VERSION);
      c.set("apiVersion", CURRENT_API_VERSION);
      return next();
    }

    c.set("apiVersion", known.version);
    c.header("X-API-Version", known.version);

    const now = Date.now();
    const sunsetMs = known.sunsetDate ? Date.parse(known.sunsetDate) : NaN;

    if (known.status === "sunset" || (Number.isFinite(sunsetMs) && sunsetMs < now)) {
      return c.json(
        {
          error: "API_VERSION_SUNSET",
          message: `API ${known.version} is no longer available.`,
          currentVersion: CURRENT_API_VERSION,
        },
        410
      );
    }

    if (known.status === "deprecated") {
      c.header("Deprecation", "true");
      if (known.sunsetDate) c.header("Sunset", new Date(known.sunsetDate).toUTCString());
      const successor = known.successor ?? CURRENT_API_VERSION;
      c.header("Link", `</${successor}>; rel="successor-version"`);
    }

    return next();
  });
}
