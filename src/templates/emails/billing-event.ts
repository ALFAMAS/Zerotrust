export interface BillingEventEmailData {
  name: string;
  /** Email headline, e.g. "Your trial ends in 3 days" */
  title: string;
  /** Main paragraph (plain text, no HTML) */
  body: string;
  /** Optional call-to-action button */
  ctaLabel?: string;
  ctaUrl?: string;
  appName: string;
  appUrl: string;
}

export function billingEventEmailTemplate(data: BillingEventEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, title, body, ctaLabel, ctaUrl, appName, appUrl } = data;

  const subject = `${title} — ${appName}`;

  const ctaButton =
    ctaLabel && ctaUrl
      ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#1e1b4b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#6366f1;font-size:28px;font-weight:700;letter-spacing:-0.5px;">${appName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;color:#111827;">
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;">${title}</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                Hi ${name},
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                ${body}
              </p>
              ${ctaButton}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                Sent by <a href="${appUrl}" style="color:#6366f1;">${appName}</a> · Manage billing in your <a href="${appUrl}/dashboard/billing" style="color:#6366f1;">dashboard</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${title} — ${appName}

Hi ${name},

${body}
${ctaLabel && ctaUrl ? `\n${ctaLabel}: ${ctaUrl}\n` : ""}
— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
