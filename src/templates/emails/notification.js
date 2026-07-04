"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationEmailTemplate = notificationEmailTemplate;
function notificationEmailTemplate(data) {
    const { name, title, body, link, unsubscribeUrl, appName, appUrl } = data;
    const subject = `${title} — ${appName}`;
    const ctaButton = link
        ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${link}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">View in App</a>
                  </td>
                </tr>
              </table>`
        : "";
    const ctaText = link ? `\nView in app: ${link}\n` : "";
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e1b4b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#6366f1;font-size:28px;font-weight:700;letter-spacing:-0.5px;">${appName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;color:#111827;">
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${title}</h2>
              <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:#6b7280;">Hi ${name},</p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">${body}</p>
              ${ctaButton}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                This notification was sent from <a href="${appUrl}" style="color:#6366f1;">${appName}</a>.
              </p>
              ${unsubscribeUrl
        ? `<p style="margin:0;font-size:12px;color:#9ca3af;">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>`
        : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const unsubLine = unsubscribeUrl ? `\nTo unsubscribe: ${unsubscribeUrl}\n` : "";
    const text = `${title}

Hi ${name},

${body}
${ctaText}
— The ${appName} Team
${appUrl}
${unsubLine}`;
    return { subject, html, text };
}
//# sourceMappingURL=notification.js.map