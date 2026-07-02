/**
 * Upload safety helpers.
 *
 * A file's extension — not the client-declared MIME type — is what a static
 * file server (and most browsers/CDNs) use to pick the `Content-Type` it serves
 * a file back with. An attacker can upload HTML/SVG/JS while *claiming*
 * `image/png` in the multipart `Content-Type`; if the server then stores it
 * under the original `.html`/`.svg` extension and serves it from an app origin,
 * the browser renders it as active content → stored XSS (CWE-79 / CWE-434).
 *
 * Defense: derive the stored extension from the *server-validated* content type
 * via a strict allowlist, so an `image/png` upload can only ever land on disk
 * (or in object storage) as `.png`, regardless of its original filename.
 */

/** Allowlisted content types → the single canonical, safe extension we store. */
const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** The set of content types we accept for uploads. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = Object.keys(CONTENT_TYPE_EXTENSION);

export function isAllowedUploadContentType(contentType: string | null | undefined): boolean {
  return typeof contentType === "string" && contentType in CONTENT_TYPE_EXTENSION;
}

/**
 * Return the safe, canonical extension (no dot) for a validated content type,
 * or `null` if the type is not on the allowlist. Callers MUST reject the upload
 * when this returns `null` rather than falling back to the user's filename.
 */
export function safeExtensionForContentType(contentType: string | null | undefined): string | null {
  if (typeof contentType !== "string") return null;
  return CONTENT_TYPE_EXTENSION[contentType] ?? null;
}
