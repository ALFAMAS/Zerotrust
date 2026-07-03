export interface OrgInviteEmailData {
  /** Email address the invite was sent to (used for the greeting when we don't have an account name). */
  email: string;
  inviterName: string;
  orgName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
  appName: string;
  appUrl: string;
}

export function orgInviteEmailTemplate(data: OrgInviteEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { email, inviterName, orgName, role, acceptUrl, expiresInDays, appName, appUrl } = data;

  const subject = `${inviterName} invited you to join ${orgName} on ${appName}`;

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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">You're invited to join ${orgName}</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                Hi ${email},
              </p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">
                <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on ${appName} as
                <strong>${role}</strong>. This invite expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${acceptUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Accept invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6b7280;">If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
              </p>
              <p style="margin:0;font-size:14px;line-height:22px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                Sent by <a href="${appUrl}" style="color:#6366f1;">${appName}</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You're invited to join ${orgName} on ${appName}

Hi ${email},

${inviterName} has invited you to join ${orgName} on ${appName} as ${role}. This invite expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}.

Accept invitation: ${acceptUrl}

If you weren't expecting this invitation, you can safely ignore this email.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
