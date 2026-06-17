# Email Deliverability Hardening

Protects sender reputation for the transactional email pipeline (BullMQ queue →
`email.service.ts`). Two parts: **DNS authentication** (SPF/DKIM/DMARC, one-time
setup) and a **suppression list** (automatic, enforced on every send).

## 1. DNS authentication

Publish these for your sending domain (`MAIL_FROM` domain). Exact values come
from your ESP (SES, Postmark, Mailgun, …).

### SPF
Authorizes which servers may send for your domain. One TXT record at the root:

```
example.com.  TXT  "v=spf1 include:amazonses.com ~all"
```

### DKIM
Cryptographically signs messages. Your ESP gives you CNAME (or TXT) records, e.g.:

```
abc123._domainkey.example.com.  CNAME  abc123.dkim.amazonses.com.
```

Enable DKIM signing in the ESP so outbound mail is signed with the published key.

### DMARC
Tells receivers what to do when SPF/DKIM fail, and where to send reports. Start
at `p=none` (monitor), then tighten to `quarantine`/`reject` once aligned:

```
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com; fo=1"
```

Verify with `dig TXT example.com`, `dig TXT _dmarc.example.com`, and an inbox
test (Gmail "Show original" → SPF/DKIM/DMARC = PASS).

## 2. Suppression list (enforced)

`email_suppressions` (migration `0011`) holds addresses we must stop emailing.
The central `sendEmail()` checks it on every send and silently skips suppressed
recipients — so a hard bounce or complaint can't keep degrading reputation.

Reasons: `bounce` · `complaint` · `manual` · `unsubscribe`.

Service: [`emailSuppression.service.ts`](../src/services/emailSuppression.service.ts)
(`isEmailSuppressed` / `suppressEmail` / `unsuppressEmail`). `isEmailSuppressed`
fails open (never drops a legitimate email on a lookup error).

## 3. Bounce / complaint webhook

Point your ESP's notification feed (SES→SNS, Postmark, Mailgun, …) at:

```
POST /webhooks/email/event
{ "email": "user@example.com", "type": "bounce" | "complaint", "detail": "550 5.1.1" }
```

Normalize the provider's payload to that shape. Hard bounces and complaints are
added to the suppression list automatically. Protect the endpoint by setting
`EMAIL_WEBHOOK_SECRET` and sending it in the `X-Webhook-Secret` header.

> Map only **hard** bounces to suppression. Soft/transient bounces should be
> retried by the queue, not suppressed.

## Operational checklist

- [ ] SPF, DKIM, DMARC published and passing on a real inbox test
- [ ] DMARC `rua` reports monitored; ramp `p=none → quarantine → reject`
- [ ] ESP bounce/complaint notifications wired to `/webhooks/email/event`
- [ ] `EMAIL_WEBHOOK_SECRET` set in production
- [ ] Periodically review the suppression list for false positives
