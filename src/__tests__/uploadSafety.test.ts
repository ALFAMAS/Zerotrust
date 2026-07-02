import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  isAllowedUploadContentType,
  safeExtensionForContentType,
} from "../services/ops/uploadSafety";

describe("uploadSafety", () => {
  it("maps each allowed content type to a single safe extension", () => {
    expect(safeExtensionForContentType("image/png")).toBe("png");
    expect(safeExtensionForContentType("image/jpeg")).toBe("jpg");
    expect(safeExtensionForContentType("application/pdf")).toBe("pdf");
    expect(safeExtensionForContentType("text/plain")).toBe("txt");
  });

  it("never yields an executable/markup extension for an image content type", () => {
    // The whole point: a file claiming image/png must store as .png, so it can
    // never be served back as active HTML/SVG/JS (stored XSS).
    for (const ct of ALLOWED_UPLOAD_CONTENT_TYPES) {
      const ext = safeExtensionForContentType(ct);
      expect(ext).not.toBeNull();
      expect(["html", "htm", "svg", "js", "mjs", "xhtml", "xml"]).not.toContain(ext);
    }
  });

  it("rejects content types that are not on the allowlist", () => {
    expect(safeExtensionForContentType("text/html")).toBeNull();
    expect(safeExtensionForContentType("image/svg+xml")).toBeNull();
    expect(safeExtensionForContentType("application/javascript")).toBeNull();
    expect(safeExtensionForContentType("")).toBeNull();
    expect(safeExtensionForContentType(null)).toBeNull();
    expect(safeExtensionForContentType(undefined)).toBeNull();
  });

  it("isAllowedUploadContentType agrees with the extension map", () => {
    expect(isAllowedUploadContentType("image/png")).toBe(true);
    expect(isAllowedUploadContentType("text/html")).toBe(false);
    expect(isAllowedUploadContentType(null)).toBe(false);
  });
});
