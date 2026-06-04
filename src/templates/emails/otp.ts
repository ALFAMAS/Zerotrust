export interface OtpEmailData {
  name: string;
  code: string;
  expiresInMinutes: number;
  appName: string;
}

export function otpEmailTemplate(data: OtpEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, code, expiresInMinutes, appName } = data;

  const subject = `Your verification code: ${code}`;

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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">Hi, ${name}!</h2>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">
                Enter this code to verify your identity. It expires in ${expiresInMinutes} minutes.
              </p>
              <!-- OTP Code Display -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px;">
                <tr>
                  <td align="center" style="background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#6366f1;">${code}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#9ca3af;">
                Do not share this code with anyone. ${appName} will never ask you for this code.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                This code was requested for your ${appName} account.
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${name},

Your ${appName} verification code is:

${code}

Enter this code to verify your identity. It expires in ${expiresInMinutes} minutes.

Do not share this code with anyone. ${appName} will never ask you for this code.

If you didn't request this, you can safely ignore this email.`;

  return { subject, html, text };
}
