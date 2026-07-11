#!/usr/bin/env bun
/**
 * Verify audit hash-chain tip against the latest external anchor record.
 *
 * Usage: bun run audit:anchor-verify
 *
 * Exits 0 when verification passes; 1 on mismatch or missing anchor.
 */
import "dotenv/config";
import { verifyAuditAnchors } from "../../src/audit/anchor";
import { closeDatabase, initializeDatabase } from "../../src/db";

await initializeDatabase();
try {
  const result = await verifyAuditAnchors();
  if (result.ok) {
    if (result.reason) {
      console.info(`○ Audit anchor verify: ${result.reason}`);
    } else {
      console.info(
        `✓ Audit anchor verify OK (seq=${result.chainTip?.seq}, anchor=${result.anchor?.anchorHash?.slice(0, 12)}…)`
      );
    }
    process.exit(0);
  }
  console.error(`✗ Audit anchor verify failed: ${result.reason}`);
  if (result.chainTip) {
    console.error(`  chain tip: seq=${result.chainTip.seq} hash=${result.chainTip.entryHash}`);
  }
  if (result.anchor) {
    console.error(
      `  latest anchor: seq=${result.anchor.seq} hash=${result.anchor.entryHash} at=${result.anchor.anchoredAt}`
    );
  }
  process.exit(1);
} finally {
  await closeDatabase();
}
