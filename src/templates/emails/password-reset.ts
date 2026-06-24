import type { Locale } from "../../shared/locale";
import { htmlLang, tr } from "./i18n";

export interface PasswordResetEmailData {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
  appName: string;
  appUrl: string;
  locale?: Locale;
}

export function passwordResetEmailTemplate(data: PasswordResetEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, resetUrl, expiresInMinutes, appName, appUrl, locale } = data;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    tr(locale, key, { ...vars, name, appName, appUrl, minutes: expiresInMinutes });
  const subject = t("reset_subject");

  const html = `<!DOCTYPE html>
<html lang="${htmlLang(locale)}">
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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${t("reset_heading")}</h2>
              <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">${t("reset_p1")}</p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">${t("reset_p2")}</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${t("reset_cta")}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6b7280;">${t("reset_link_help")}<br>
                <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
              </p>
              <p style="margin:0;font-size:14px;line-height:22px;color:#b45309;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">${t("reset_security")}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">${t("reset_footer")}</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">${t("reset_valid")}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${t("reset_heading")}

${t("reset_p1")}

${t("reset_cta")}: ${resetUrl}

${t("reset_security")}

${t("reset_team")}
${appUrl}`;

  return { subject, html, text };
}
