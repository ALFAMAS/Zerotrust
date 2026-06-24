# Audit Log Anchoring Plan

Owner: Mas Yasin Arafat  
Review cadence: Before implementation, then annually  
Status: Design draft, not implemented

zerotrust already has a tamper-evident audit log hash chain. This plan covers the
optional hardening step: anchoring the latest `entry_hash` outside the primary
database so database-level tampering is easier to prove.

## Current Control

- `audit_logs.seq`, `prev_hash`, and `entry_hash` are created in migration `0013`.
- `insertAuditLog()` chains entries under an advisory lock.
- `verifyAuditChain()` detects edits, deletes, and reordering.
- Admin UI exposes integrity verification.

## Proposed Anchor

Create a scheduled job that records the latest audit `seq` and `entry_hash` to an
external append-only location.

Acceptable anchor targets:

- Cloud object storage with object lock / retention.
- Third-party transparency log.
- Dedicated append-only audit service.
- Signed email to a restricted compliance mailbox as a lightweight interim step.

## Anchor Record

```json
{
  "system": "zerotrust",
  "environment": "production",
  "anchoredAt": "ISO-8601 timestamp",
  "latestSeq": 123,
  "latestEntryHash": "hex",
  "previousAnchorHash": "hex or null",
  "anchorHash": "hex",
  "signature": "optional detached signature"
}
```

## Implementation Steps

1. Add `audit_log_anchors` table or object-storage writer.
2. Add scheduled anchor job.
3. Add verification command that compares database chain to anchors.
4. Alert when anchoring fails.
5. Store anchor evidence monthly.

## Open Questions

- Which external anchor target should be used for production?
- Is object-lock retention available on the configured object storage provider?
- Should anchors be signed with a separate key from application secrets?
