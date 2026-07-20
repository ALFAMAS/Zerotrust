import crypto from "node:crypto";
import { getLogger } from "../logger";

const logger = getLogger("ssf-verify");

/**
 * Verify SSF/SET payload using HMAC-SHA256 if SSF_SHARED_SECRET is configured.
 * Header must be `x-ssf-signature: sha256=<hex>`
 */
export function verifySSFSignature(payload: any, signatureHeader?: string): boolean {
  const secret = process.env.SSF_SHARED_SECRET;
  if (!secret) {
    // The /ssf/events endpoint is unauthenticated and CSRF-exempt, and a valid
    // event can inject audit-log entries and revoke arbitrary sessions. Failing
    // open here (accepting unsigned events) is only acceptable in an explicitly
    // recognized local development/test mode. Fail CLOSED by default — anything
    // that is not exactly `development`/`test` (production, staging, unset, …)
    // rejects, so a misconfiguration cannot be exploited to forge events.
    const nodeEnv = process.env.NODE_ENV;
    const isDevOrTest = nodeEnv === "development" || nodeEnv === "test";
    if (!isDevOrTest) {
      logger.error(
        "SSF_SHARED_SECRET not configured outside development; rejecting SSF event (fail-closed)"
      );
      return false;
    }
    logger.warn(
      "SSF_SHARED_SECRET not configured; skipping signature verification (dev/test only)"
    );
    return true; // permissive only in explicit development/test
  }
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const sigHex = signatureHeader.slice(prefix.length);

  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const h = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expected = Buffer.from(h, "hex");
  const provided = Buffer.from(sigHex, "hex");
  // timingSafeEqual throws RangeError on unequal lengths; guard so a malformed
  // signature yields a clean rejection instead of an unhandled 500.
  const ok = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  if (!ok) logger.warn("SSF signature verification failed");
  return ok;
}
