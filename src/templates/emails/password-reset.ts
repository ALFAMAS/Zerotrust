export interface PasswordResetEmailData {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
  appName: string;
  appUrl: string;
}

export function passwordResetEmailTemplate(data: PasswordResetEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, resetUrl, expiresInMinutes, appName, appUrl } = data;

  const subject = `Reset your ${appName} password`;

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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Password Reset Request</h2>
              <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">
                Hi ${name}, we received a request to reset the password for your ${appName} account.
              </p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">
                Click the button below to set a new password. This link expires in ${expiresInMinutes} minutes.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6b7280;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
              </p>
              <!-- Security Note -->
              <p style="margin:0;font-size:14px;line-height:22px;color:#b45309;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">
                <strong>Security notice:</strong> If you didn't request a password reset, please secure your account immediately by changing your password and reviewing your active sessions.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                You received this email because a password reset was requested at <a href="${appUrl}" style="color:#6366f1;">${appName}</a>.
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                This link is valid for ${expiresInMinutes} minutes.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Password Reset Request

Hi ${name},

We received a request to reset the password for your ${appName} account.

Reset your password here (expires in ${expiresInMinutes} minutes):
${resetUrl}

If you didn't request a password reset, please secure your account immediately.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
