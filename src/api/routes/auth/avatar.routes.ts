import * as fs from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../../db";
import { usersTable } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import { rateLimit } from "../../../middleware/rateLimiting";
import { invalidateUserCache } from "../../../services/auth/userStateCache.service";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// ── POST /auth/me/avatar ──────────────────────────────────────────────────────

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

router.post(
  "/me/avatar",
  authMiddleware,
  rateLimit({ points: 10, windowSecs: 3600 }),
  async (c) => {
    try {
      const user = c.get("user");
      const formData = await c.req.formData();
      const file = formData.get("avatar");

      if (!file || !(file instanceof File)) {
        return c.json({ error: "INVALID_REQUEST", message: "avatar file required" }, 400);
      }

      const ext = ALLOWED_AVATAR_TYPES[file.type];
      if (!ext) {
        return c.json(
          {
            error: "INVALID_TYPE",
            message: "Only JPEG, PNG, GIF, WebP images are allowed",
          },
          400
        );
      }

      if (file.size > MAX_AVATAR_BYTES) {
        return c.json({ error: "FILE_TOO_LARGE", message: "Avatar must be under 5 MB" }, 400);
      }

      const db = getDb();
      const buffer = Buffer.from(await file.arrayBuffer());
      const objectKey = `avatars/${user.id}-${Date.now()}.${ext}`;
      const { deleteObject, isS3BackupEnabled, parseObjectKeyFromPublicUrl, uploadBuffer } =
        await import("../../../services/ops/objectStorage.service.js");

      // Prefer S3 (same bucket as backups) when configured; fall back to the
      // legacy local-disk path when S3 isn't set so local dev keeps working.
      let avatarUrl: string;
      const s3Enabled = await isS3BackupEnabled();
      if (s3Enabled) {
        const result = await uploadBuffer({
          key: objectKey,
          body: buffer,
          contentType: file.type,
        });
        avatarUrl = result.url;
      } else {
        const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
        await fs.mkdir(uploadsDir, { recursive: true });
        const filename = `${user.id}-${Date.now()}.${ext}`;
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, buffer);
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        avatarUrl = `${appUrl}/uploads/avatars/${filename}`;
      }

      // Best-effort: clean up the previous S3 avatar so the bucket doesn't
      // accumulate dead objects. Failures are logged, not returned.
      const previous = await db
        .select({ avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      const oldUrl = previous[0]?.avatarUrl ?? null;
      if (oldUrl && oldUrl !== avatarUrl) {
        const oldKey = parseObjectKeyFromPublicUrl(oldUrl);
        if (oldKey) {
          try {
            await deleteObject(oldKey);
          } catch (err) {
            logger.warn("Failed to delete previous avatar from S3", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      await db
        .update(usersTable)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      await invalidateUserCache(user.id);

      return c.json({ avatarUrl });
    } catch (err) {
      return internalError(c, logger, "Avatar upload error", err);
    }
  }
);

export default router;
