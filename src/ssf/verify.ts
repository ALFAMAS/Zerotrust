import crypto from "crypto";
import { getLogger } from "../logger";

const logger = getLogger("ssf-verify");

/**
 * Verify SSF/SET payload using HMAC-SHA256 if SSF_SHARED_SECRET is configured.
 * Header must be `x-ssf-signature: sha256=<hex>`
 */
export function verifySSFSignature(payload: any, signatureHeader?: string): boolean {
  const secret = process.env.SSF_SHARED_SECRET;
  if (!secret) {
    logger.warn("SSF_SHARED_SECRET not configured; skipping signature verification");
    return true; // permissive when not configured
  }
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const sigHex = signatureHeader.slice(prefix.length);

  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const h = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(sigHex, "hex"));
  if (!ok) logger.warn("SSF signature verification failed");
  return ok;
}
