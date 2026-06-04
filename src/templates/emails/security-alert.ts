export interface SecurityAlertEmailData {
  name: string;
  action: string;
  device: string;
  location: string;
  time: string;
  appName: string;
  appUrl: string;
  revokeSessionUrl?: string;
}

export function securityAlertEmailTemplate(data: SecurityAlertEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, action, device, location, time, appName, appUrl, revokeSessionUrl } = data;

  const subject = `Security alert: ${action} on your ${appName} account`;

  const revokeButton = revokeSessionUrl
    ? `<table cellpadding="0" cellspacing="0" style="margin:0 8px 8px 0;display:inline-table;">
                <tr>
                  <td style="background-color:#e11d48;border-radius:8px;">
                    <a href="${revokeSessionUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Secure My Account</a>
                  </td>
                </tr>
              </table>`
    : "";

  const wasmeButton = `<table cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;display:inline-table;">
                <tr>
                  <td style="background-color:#e5e7eb;border-radius:8px;">
                    <a href="${appUrl}" style="display:inline-block;padding:12px 24px;color:#374151;font-size:15px;font-weight:600;text-decoration:none;">This was me</a>
                  </td>
                </tr>
              </table>`;

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
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;">Security Alert</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                Hi ${name}, we detected the following activity on your ${appName} account:
              </p>
              <!-- Activity Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="padding:12px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Activity</td>
                  <td style="padding:12px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;">${action}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Device</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${device}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Location</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${location}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Time</td>
                  <td style="padding:12px 16px;font-size:14px;color:#374151;">${time}</td>
                </tr>
              </table>
              <!-- Warning -->
              <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#92400e;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">
                <strong>If this wasn't you</strong>, your account may be compromised. Click "Secure My Account" immediately to revoke access and change your password.
              </p>
              <!-- CTA Buttons -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    ${revokeButton}
                    ${wasmeButton}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                This security alert was sent from <a href="${appUrl}" style="color:#6366f1;">${appName}</a>.
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                If you believe this is an error, contact our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Security Alert — ${appName}

Hi ${name},

We detected the following activity on your ${appName} account:

  Activity : ${action}
  Device   : ${device}
  Location : ${location}
  Time     : ${time}

If this wasn't you, your account may be compromised.${revokeSessionUrl ? `\nSecure your account immediately: ${revokeSessionUrl}` : ""}

If this was you, no action is needed.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
