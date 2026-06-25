# Phase 5 — Disaster Recovery and Operations Evidence

Date: 2026-06-25  
Goal: make disaster-recovery validation repeatable, evidenced, and safe to run without touching production data.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| Restore drill automation | `.github/workflows/dr-restore-drill.yml` runs weekly and manually against two isolated Postgres services. | A backup can be created, encrypted, restored, and queried in CI. |
| Evidence row validation | The workflow seeds a non-production user row, restores the backup, and verifies the row exists in the restore target. | Restore is functionally validated, not just command-executed. |
| Backup artifact evidence | Encrypted dump and metadata are uploaded as workflow artifacts. | Humans can retain drill evidence for SOC 2 / operational review. |

## Human operating notes

1. Keep production restore drills pointed at isolated non-production targets only.
2. Rotate `BACKUP_ENCRYPTION_KEY_HEX` outside CI for real environments; the workflow key is for ephemeral CI evidence only.
3. Review weekly workflow artifacts and copy accepted evidence into the compliance evidence folder.
4. After every storage-provider change, run the workflow manually and attach results to the release PR.
