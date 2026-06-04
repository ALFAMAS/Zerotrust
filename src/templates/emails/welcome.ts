export interface WelcomeEmailData {
  name: string;
  appName: string;
  appUrl: string;
  loginUrl: string;
}

export function welcomeEmailTemplate(data: WelcomeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, appName, appUrl, loginUrl } = data;

  const subject = `Welcome to ${appName}!`;

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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Welcome, ${name}!</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                Your account has been created successfully. We're thrilled to have you on board.
              </p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">
                You can now sign in to your account and start exploring everything ${appName} has to offer.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Sign In to Your Account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${loginUrl}" style="color:#6366f1;word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                You received this email because you registered at <a href="${appUrl}" style="color:#6366f1;">${appName}</a>.
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to ${appName}, ${name}!

Your account has been created successfully. We're thrilled to have you on board.

Sign in to your account here:
${loginUrl}

If you didn't create an account, you can safely ignore this email.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
