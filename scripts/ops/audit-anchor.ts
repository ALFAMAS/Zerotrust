#!/usr/bin/env bun
/**
 * One-shot audit hash-chain anchor.
 *
 * Usage: bun run audit:anchor
 *
 * Env: DATABASE_URL (required), AUDIT_ANCHOR_ENABLED=true,
 *      optional S3 via BACKUP_S3_* (same as db backups),
 *      AUDIT_ANCHOR_S3_PREFIX (default audit-anchors/),
 *      AUDIT_ANCHOR_ENVIRONMENT (default NODE_ENV)
 */
import "dotenv/config";
import { runAuditAnchor } from "../../src/audit/anchor";
import { closeDatabase, initializeDatabase } from "../../src/db";

process.env.AUDIT_ANCHOR_ENABLED = "true";

await initializeDatabase();
try {
  const result = await runAuditAnchor();
  if (result.skipped) {
    console.info(`○ Audit anchor skipped: ${result.reason}`);
    process.exit(0);
  }
  if (!result.ok) {
    console.error(`✗ Audit anchor failed: ${result.error}`);
    process.exit(1);
  }
  console.info(
    `✓ Audit anchor recorded (seq=${result.latestSeq}, id=${result.anchorId}${
      result.externalKey ? `, s3=${result.externalKey}` : ""
    })`
  );
} finally {
  await closeDatabase();
}
