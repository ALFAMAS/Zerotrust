# Audit Log Anchoring Plan

Owner: Mas Yasin Arafat  
Review cadence: Annually  
Status: **Implemented** (2026-07-03)

zerotrust already has a tamper-evident audit log hash chain. This document describes the
external anchoring hardening step: recording the latest `entry_hash` outside the primary
database so database-level tampering is easier to prove.

## Current Control

- `audit_logs.seq`, `prev_hash`, and `entry_hash` are created in migration `0013`.
- `insertAuditLog()` chains entries under an advisory lock.
- `verifyAuditChain()` detects edits, deletes, and reordering.
- Admin UI exposes integrity verification.
- **Anchoring (P5.1):** `audit_log_anchors` table (migration `0029`), `runAuditAnchor()`,
  scheduled `audit.anchor` job, and `bun run audit:anchor-verify`.

## Anchor Record

```json
{
  "system": "zerotrust",
  "environment": "production",
  "anchoredAt": "ISO-8601 timestamp",
  "latestSeq": 123,
  "latestEntryHash": "hex",
  "previousAnchorHash": "hex or null",
  "anchorHash": "hex"
}
```

## Operations

| Action | Command / job |
| --- | --- |
| Scheduled anchor | `audit.anchor` job (24h, `AUDIT_ANCHOR_ENABLED=true`) |
| One-shot anchor | `bun run audit:anchor` |
| Verify tip vs anchor | `bun run audit:anchor-verify` |
| Evidence | `docs/compliance/evidence/YYYY/QN/audit-log/` |

## Configuration

```env
AUDIT_ANCHOR_ENABLED=false          # set true in production
AUDIT_ANCHOR_ENVIRONMENT=production # defaults to NODE_ENV
AUDIT_ANCHOR_S3_PREFIX=audit-anchors/  # uses BACKUP_S3_* credentials when set
```

Anchors are stored in Postgres (`audit_log_anchors`) and, when S3 backup credentials are
configured, uploaded as append-only JSON objects under `AUDIT_ANCHOR_S3_PREFIX`.

## Production tuning (optional)

- Which external anchor target should be primary for long-term retention (object lock)?
- Should anchors be signed with a separate key from application secrets?

These are deployment decisions, not open implementation work.
