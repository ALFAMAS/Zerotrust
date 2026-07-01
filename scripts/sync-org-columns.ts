/**
 * Sync missing `organizations` columns.
 *
 * The `GET /orgs` Drizzle query selects every column from the `organizations`
 * table. When columns were added in later migrations (e.g. 0017) but not yet
 * applied, the query fails with "Failed query" from postgres-js.
 *
 * This script is idempotent — every ALTER uses IF NOT EXISTS so it's safe to
 * run repeatedly, including after a partial application.
 *
 * Usage:  bun run scripts/sync-org-columns.ts
 */

import postgres from "postgres";

const COLUMNS: { name: string; type: string; default?: string }[] = [
  { name: "sso_config", type: "jsonb" },
  { name: "custom_domain", type: "text" },
  { name: "branding", type: "jsonb" },
  { name: "storage_region", type: "text", default: "'us'" },
  { name: "tenant_id", type: "uuid" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = postgres(url, { connect_timeout: 10, max: 1 });

  try {
    for (const col of COLUMNS) {
      const def = col.default ? ` DEFAULT ${col.default}` : "";
      console.log(
        `Adding column organizations.${col.name} (${col.type}${def}) …`
      );
      try {
        await sql.unsafe(
          `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}${def}`
        );
        console.log(`  ✓ done`);
      } catch (err: any) {
        // IF NOT EXISTS should prevent most failures, but log anyway
        if (err.code === "42701") {
          console.log(`  ⚠ already exists, skipping`);
        } else {
          console.error(`  ✗ ${err.message}`);
        }
      }
    }

    console.log("\nDone. Restart the API and try GET /orgs again.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
