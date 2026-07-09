import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { fileAttachmentsTable } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  safeExtensionForContentType,
} from "../../../services/ops/uploadSafety";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../../shared/pagination";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// ── Webhook delivery logs ─────────────────────────────────────────────────────

// GET /admin/webhooks/:webhookId/deliveries — list delivery attempts
router.get("/webhooks/:webhookId/deliveries", async (c) => {
  try {
    const { webhookId } = c.req.param();
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const { getDeliveryLogs, countDeliveryLogs } = await import(
      "../../../services/ops/webhookDeliveryLog.service.js"
    );
    const [logs, total] = await Promise.all([
      getDeliveryLogs(webhookId, limit, offset),
      countDeliveryLogs(webhookId),
    ]);
    return c.json(paginated(logs, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin webhook deliveries error", err);
  }
});

// ── Pre-signed uploads ────────────────────────────────────────────────────────

// POST /admin/uploads/presigned — generate a pre-signed upload URL (admin+)
router.post("/uploads/presigned", async (c) => {
  try {
    const { contentType, fileName, maxSize } = await c.req.json().catch(() => ({}));
    if (!contentType || !fileName) {
      return c.json(
        { error: "INVALID_REQUEST", message: "contentType and fileName required" },
        400
      );
    }
    const { generatePresignedUploadUrl } = await import(
      "../../../services/ops/presignedUpload.service.js"
    );
    const result = await generatePresignedUploadUrl({ contentType, fileName, maxSize });
    return c.json(result);
  } catch (err: any) {
    logger.error("Admin presigned upload error", err as Error);
    return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
  }
});

// ── File attachments ──────────────────────────────────────────────────────────

// GET /admin/attachments — list file attachments (admin)
router.get("/attachments", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const feature = c.req.query("feature");
    const db = getReadDb();
    const conditions = feature ? eq(fileAttachmentsTable.feature, feature) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(fileAttachmentsTable)
        .where(conditions)
        .orderBy(desc(fileAttachmentsTable.createdAt))
        .offset(offset)
        .limit(limit),
      countRows(db, fileAttachmentsTable, conditions),
    ]);
    return c.json(paginated(rows, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin attachments error", err);
  }
});

// POST /admin/attachments/upload — upload a file attachment
router.post("/attachments/upload", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const feature = formData.get("feature") as string | null;
    const featureRecordId = formData.get("feature_record_id") as string | null;
    const orgId = formData.get("org_id") as string | null;

    if (!file || !feature) {
      return c.json({ error: "INVALID_REQUEST", message: "file and feature required" }, 400);
    }

    // Validate file type and size. The stored extension is derived from the
    // server-validated content type (never the client filename) so a file that
    // claims image/png cannot be persisted/served as .html/.svg → stored XSS.
    const safeExt = safeExtensionForContentType(file.type);
    if (!safeExt) {
      return c.json(
        {
          error: "INVALID_FILE_TYPE",
          message: `Allowed types: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`,
        },
        400
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      return c.json({ error: "FILE_TOO_LARGE", message: "Max file size is 10 MB" }, 400);
    }

    // Upload to S3 (stamped with a long-lived Cache-Control so an edge/CDN can
    // cache it) or fall back to local disk.
    const { uploadBuffer, isS3BackupEnabled, getUploadCacheControl } = await import(
      "../../../services/ops/objectStorage.service.js"
    );
    const cacheControl = getUploadCacheControl();
    const storageKey = `attachments/${Date.now()}-${randomUUID()}.${safeExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    if (isS3BackupEnabled()) {
      // uploadBuffer returns the CDN/edge-aware delivery URL for the stored key.
      const uploaded = await uploadBuffer({
        key: storageKey,
        body: buffer,
        contentType: file.type,
        cacheControl,
      });
      url = uploaded.url;
    } else {
      // Fallback: store locally
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const uploadDir = path.join(process.cwd(), "uploads", "attachments");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, storageKey.replace(/\//g, "_")), buffer);
      url = `/uploads/attachments/${storageKey.replace(/\//g, "_")}`;
    }

    // Record in database
    const db = getDb();
    const [attachment] = await db
      .insert(fileAttachmentsTable)
      .values({
        userId: user.id,
        orgId,
        feature,
        featureRecordId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        storageKey,
      })
      .returning();

    return c.json({ attachment, url, cacheControl }, 201);
  } catch (err) {
    return internalError(c, logger, "Admin attachment upload error", err);
  }
});

export default router;
