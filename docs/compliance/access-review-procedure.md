# Access Review Procedure

Owner: Mas Yasin Arafat  
Review cadence: Quarterly  
Status: Draft, maps to shipped access-review tooling

zerotrust ships access review tooling under `/admin/access-reviews`, backed by
`access_reviews` and `access_review_items`.

## Scope

Review all privileged access, including:

- Admin users.
- Non-default roles.
- Production database access.
- Repository admin access.
- Cloud and observability access.
- Service accounts and workload credentials.

## Procedure

1. Open `/admin/access-reviews`.
2. Start a new review.
3. Review every item and choose approve, flag, or revoke.
4. For revoked access, confirm the system removed the elevated role or manually
   remove access in external systems.
5. Export or screenshot the completed review.
6. Record external system checks in the evidence register.
7. Store evidence in the quarterly evidence folder.

## Evidence

- Completed access review record from zerotrust.
- List of reviewers and review date.
- Exceptions with owner and expiry.
- Proof of removals for revoked access.
- External access exports for systems not managed by zerotrust.

## Quarterly Record Template

```text
Quarter:
Review started:
Review completed:
Reviewer:
Scope:
Items reviewed:
Approved:
Flagged:
Revoked:
Exceptions:
Evidence link:
Follow-up actions:
```
