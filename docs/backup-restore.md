# Backup, Restore & Point-in-Time Recovery (PITR)

This runbook closes the loop on the P0 **DB backup** item: it documents how to
restore from a logical backup and how to use point-in-time recovery on managed
Postgres (Neon).

## What we back up

`bun run db:backup` (see [`scripts/db-backup.js`](../scripts/db-backup.js)) runs
`pg_dump --format=custom` into `BACKUP_DIR` (default `./backups`), prunes dumps
older than `BACKUP_RETENTION_DAYS` (default 30), and optionally uploads to
`BACKUP_S3_BUCKET` via the `aws` CLI. With `BACKUP_ENABLED=true` the API server
runs this on a daily scheduler (`startBackupScheduler`).

Custom-format dumps are compressed and restored selectively with `pg_restore`.

## Restore from a logical backup

> ⚠️ Restoring writes into whatever `DATABASE_URL` points at. **Point it at the
> intended target** (a fresh database or a staging instance) before running.
> Never test a restore against production.

```bash
# 1. Pick a dump (local or pulled from S3)
ls -lh ./backups
# aws s3 cp s3://$BACKUP_S3_BUCKET/backups/zeroauth-<stamp>.dump ./backups/

# 2. Restore into the target database (DATABASE_URL = target)
bun run db:restore -- ./backups/zeroauth-<stamp>.dump

# 2b. Or replace existing objects first (drop + recreate)
bun run db:restore -- ./backups/zeroauth-<stamp>.dump --clean
```

The script uses `pg_restore --no-owner --no-privileges` so the dump restores
cleanly under a different role (e.g. the Neon owner). Relation/role notices are
expected and non-fatal.

### Verify after restore

```sql
-- row counts sanity check
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'organizations', count(*) FROM organizations
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;

-- migration state matches the codebase
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
```

Then run `bun run db:migrate` to apply any migrations newer than the dump.

## Point-in-time recovery (Neon)

The database is hosted on Neon, which keeps a continuous WAL history and supports
restoring to any instant inside the retention window — finer-grained than the
daily logical dumps.

1. **Neon console → Project → Branches → Restore** (or `Backup & Restore`).
2. Choose **Restore to a point in time** and pick the timestamp just *before* the
   incident (e.g. a bad migration or bulk delete).
3. Neon creates a new branch at that LSN/timestamp. Validate it using a temporary
   connection string before promoting.
4. **Promote** the recovered branch (or repoint the app's `DATABASE_URL` at it).
   Rotate the connection string afterwards if it was exposed.

CLI equivalent:

```bash
neonctl branches create --name recover-$(date +%s) \
  --parent-timestamp 2026-06-18T09:30:00Z
# inspect, then:
neonctl connection-string recover-<id>
```

## Choosing a recovery path

| Scenario | Use |
| --- | --- |
| Accidental row/table delete, recent | **Neon PITR** to just before the event |
| Bad migration in the last few minutes | **Neon PITR** to pre-migration timestamp |
| Full-database loss / provider outage | `pg_restore` from the latest off-site (S3) dump |
| Migrating to a new instance/region | `pg_restore` into the new target |

## RPO / RTO targets

- **RPO** ≈ 24h from logical dumps; **near-zero** within the Neon PITR window.
- **RTO**: PITR branch is typically minutes; a full `pg_restore` scales with DB
  size (validate periodically with a real restore drill into staging).

## Quarterly restore drill

Restore the latest dump into a throwaway database and run the verification
queries + `bun run test` against it. A backup you've never restored is a hope,
not a backup.
