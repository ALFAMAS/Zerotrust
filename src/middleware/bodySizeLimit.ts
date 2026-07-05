import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";

/** Default JSON/text body cap (1 MiB) — SEC-13. */
export const DEFAULT_JSON_BODY_LIMIT = 1_048_576;

/** Multipart uploads (avatar, admin attachments) use a higher ceiling. */
export const MULTIPART_BODY_LIMIT = 10 * 1024 * 1024;

const jsonBodyLimit = bodyLimit({
  maxSize: DEFAULT_JSON_BODY_LIMIT,
  onError: (c) => c.json({ error: "PAYLOAD_TOO_LARGE", message: "Request body too large" }, 413),
});

const multipartBodyLimit = bodyLimit({
  maxSize: MULTIPART_BODY_LIMIT,
  onError: (c) => c.json({ error: "PAYLOAD_TOO_LARGE", message: "Upload payload too large" }, 413),
});

/**
 * Global request body size guard. JSON bodies are capped at 1 MiB; multipart
 * uploads get a separate 10 MiB limit. Presigned upload URLs are JSON-only.
 */
export const bodySizeLimitMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
    return next();
  }
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return multipartBodyLimit(c, next);
  }
  return jsonBodyLimit(c, next);
});
