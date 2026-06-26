import { randomBytes } from "node:crypto";
import { getLogger } from "../logger";
import { safeExtensionForContentType } from "./uploadSafety";

const logger = getLogger("presigned-upload");

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PRESIGNED_CONTENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];
const UPLOAD_TTL_SECS = 900;

interface PresignedUrl {
  url: string;
  key: string;
  expiresIn: number;
  maxSize: number;
  allowedTypes: readonly string[];
}

export async function generatePresignedUploadUrl(input: {
  contentType: string;
  fileName: string;
  maxSize?: number;
}): Promise<PresignedUrl> {
  if (!ALLOWED_PRESIGNED_CONTENT_TYPES.includes(input.contentType)) {
    throw new Error(`Invalid content type. Allowed: ${ALLOWED_PRESIGNED_CONTENT_TYPES.join(", ")}`);
  }
  const ext = safeExtensionForContentType(input.contentType);
  if (!ext) {
    throw new Error(`Invalid content type. Allowed: ${ALLOWED_PRESIGNED_CONTENT_TYPES.join(", ")}`);
  }

  const maxSize = Math.min(input.maxSize ?? MAX_FILE_SIZE, MAX_FILE_SIZE);
  // SECURITY (CWE-22): derive the object-key extension from the validated
  // content type, never from the client-provided filename. Otherwise an upload
  // with contentType=image/png and fileName=payload.html would be stored and
  // served as active HTML from the application/CDN origin.
  const key = `uploads/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

  const { isS3BackupEnabled, getS3Config } = await import("./objectStorage.service.js");
  if (!isS3BackupEnabled()) {
    throw new Error("S3 storage not configured. Set BACKUP_S3_BUCKET and related env vars.");
  }

  const cfg = getS3Config();
  if (!cfg) throw new Error("S3 config not available");

  // Build a pre-signed URL pattern using the configured endpoint
  const baseUrl =
    cfg.endpoint || `https://${cfg.bucket}.s3.${cfg.region || "us-east-1"}.amazonaws.com`;
  const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECS;

  // Simple signed URL using HMAC (compatible with S3 signature v4)
  const { createHmac } = await import("node:crypto");
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const scope = `${dateStr}/${cfg.region || "us-east-1"}/s3/aws4_request`;
  const stringToSign = `PUT\n\n${input.contentType}\n${expiresAt}\n/${cfg.bucket}/${key}`;
  const signature = createHmac("sha256", cfg.secretAccessKey || "")
    .update(stringToSign)
    .digest("hex");

  const url =
    baseUrl +
    "/" +
    key +
    "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=" +
    (cfg.accessKeyId || "") +
    "%2F" +
    scope +
    "&X-Amz-Date=" +
    new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) +
    "Z&X-Amz-Expires=" +
    UPLOAD_TTL_SECS +
    "&X-Amz-SignedHeaders=host&X-Amz-Signature=" +
    signature;

  logger.info("Pre-signed upload URL generated", { key, contentType: input.contentType });
  return {
    url,
    key,
    expiresIn: UPLOAD_TTL_SECS,
    maxSize,
    allowedTypes: ALLOWED_PRESIGNED_CONTENT_TYPES,
  };
}
