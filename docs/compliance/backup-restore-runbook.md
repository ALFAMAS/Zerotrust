# Backup And Restore Runbook

Owner: Mas Yasin Arafat  
Review cadence: Quarterly restore drill  
Status: Draft, needs periodic evidence

zerotrust has backup tooling in `scripts/db-backup.js`, `scripts/db-restore.js`,
and `src/services/dbBackup.service.ts`. Neon PITR may also be available depending
on the active database plan.

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
3. Select a backup artifact.
4. Run the restore command.
5. Verify schema and representative row counts.
6. Run application smoke checks against the restored database if practical.
7. Destroy the temporary restore environment.
8. Record evidence.

```bash
bun run db:restore
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
