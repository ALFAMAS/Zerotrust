# Backup And Restore Runbook

Owner: Mas Yasin Arafat  
Review cadence: Quarterly manual drill + the automated `dr-restore-drill.yml` CI run  
Status: Active — automated restore drill in CI; record manual-drill evidence below

zerotrust has backup tooling in `scripts/db-backup.js`, `scripts/db-restore.js`,
and `src/services/dbBackup.service.ts`. Neon PITR may also be available depending
on the active database plan.

## Recovery Objectives (RTO / RPO)

| Objective | Target | How it is met |
| --- | --- | --- |
| **RPO** — max acceptable data loss | **≤ 24 h** with scheduled dumps; **~minutes** with provider PITR | `BACKUP_ENABLED=true` runs a daily `pg_dump` (`startBackupScheduler`, default 24 h interval) with local + S3 retention; managed-Postgres PITR (e.g. Neon) closes the gap to minutes when enabled. |
| **RTO** — max acceptable downtime | **≤ 1 h** to restore a dump into a fresh database | `bun run db:restore` into a clean target; **measured each drill** and recorded below. RTO scales with DB size — re-measure as data grows. |

A warm standby / PITR gives the lowest RTO; the encrypted dump is the portable,
provider-independent safety net. Always record the **measured** restore time from
the latest drill so these targets stay honest rather than aspirational.

## Backup Cadence & Retention

- Scheduled backups: `BACKUP_ENABLED=true` (daily via the in-server scheduler);
  otherwise drive `bun run db:backup` from cron/CI.
- Retention: `BACKUP_RETENTION_DAYS` (local, default 30) and
  `BACKUP_S3_RETENTION_DAYS` (S3; falls back to the local value).
- Production/staging: set `BACKUP_ENCRYPTION_KEY`/`_HEX` **and**
  `BACKUP_REQUIRE_ENCRYPTION=true` so a missing/invalid key fails closed before
  `pg_dump` ever writes a plaintext dump.

## Automated Validation (recurring evidence)

The **`dr-restore-drill.yml`** workflow runs the full backup → encrypt → restore
cycle into an **isolated** Postgres on a schedule (and on demand), verifies the
restored data, and uploads the backup artifact. This is the recurring, dated
evidence for the "validated" half of the DR control — link each green run in the
evidence section below. **A failed drill is a DR regression: page the owner.**

## Backup Configuration

Required environment variables depend on the selected backup destination. Check
`.env.example` and `src/services/objectStorage.service.ts` for the current S3 /
R2 / B2 / MinIO-compatible settings.

Expected controls:

- Backups are encrypted in transit.
- Object storage credentials are not committed to source control.
- Backup failures are monitored.
- Restore drills are run quarterly.

## Manual Backup

```bash
bun run db:backup
```

Set `BACKUP_ENCRYPTION_KEY` or `BACKUP_ENCRYPTION_KEY_HEX` to produce
AES-256-GCM encrypted `.dump.enc` artifacts. Use
`BACKUP_REQUIRE_ENCRYPTION=true` in production/staging so a missing or invalid
key fails before `pg_dump` writes a plaintext dump.

Record:

- Date/time.
- Operator.
- Source database.
- Backup location or object key.
- Command output.
- Any errors.

## Manual Restore Drill

Run restore drills into an isolated non-production database. Never restore over
production during a drill.

1. Create or identify an isolated restore database.
2. Confirm the target database URL points to the isolated database.
3. Select a backup artifact. For encrypted `.dump.enc` artifacts, make sure the
   matching `.dump.enc.meta` file is next to the encrypted backup, or set
   `BACKUP_ENCRYPTED_METADATA_FILE` to its path. Export the same
   `BACKUP_ENCRYPTION_KEY` or `BACKUP_ENCRYPTION_KEY_HEX` used when the backup
   was created.
4. Run the restore command.
5. Verify schema and representative row counts.
6. Run application smoke checks against the restored database if practical.
7. Destroy the temporary restore environment.
8. Record evidence.

```bash
bun run db:restore -- ./backups/zerotrust-<stamp>.dump
# or, for encrypted backups:
BACKUP_ENCRYPTION_KEY=... bun run db:restore -- ./backups/zerotrust-<stamp>.dump.enc
```

## Restore Drill Evidence Template

```text
Drill date:
Operator:
Backup artifact:
Restore target:
Restore command:
Started at:
Completed at:
Result:

Verification:
  - Schema present:
  - Representative tables checked:
  - Application smoke test:

Issues found:

Follow-up actions:

Evidence links:
```

## Production Recovery Notes

For a real incident:

- Assign an incident commander.
- Snapshot current state before destructive recovery actions if possible.
- Prefer provider PITR for database corruption or accidental deletion.
- Verify application login, admin access, audit log writes, and billing-critical
  flows after restore.
- Complete a post-incident review.
