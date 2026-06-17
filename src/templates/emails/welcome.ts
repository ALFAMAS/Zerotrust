import type { Locale } from "../../shared/locale";
import { tr, htmlLang } from "./i18n";

export interface WelcomeEmailData {
  name: string;
  appName: string;
  appUrl: string;
  loginUrl: string;
  locale?: Locale;
}

export function welcomeEmailTemplate(data: WelcomeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { name, appName, appUrl, loginUrl, locale } = data;
  const v = { name, appName };

  const subject = tr(locale, "welcome_subject", v);

  const html = `<!DOCTYPE html>
<html lang="${htmlLang(locale)}">
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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${tr(locale, "welcome_heading", v)}</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                ${tr(locale, "welcome_p1", v)}
              </p>
              <p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#374151;">
                ${tr(locale, "welcome_p2", v)}
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#6366f1;border-radius:8px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${tr(locale, "welcome_cta", v)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
                ${tr(locale, "welcome_link_help", v)}<br>
                <a href="${loginUrl}" style="color:#6366f1;word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                ${tr(locale, "welcome_footer_registered", v)}
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                ${tr(locale, "welcome_footer_ignore", v)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${tr(locale, "welcome_heading", v)}

${tr(locale, "welcome_p1", v)}

${tr(locale, "welcome_cta", v)}:
${loginUrl}

${tr(locale, "welcome_footer_ignore", v)}

${tr(locale, "welcome_team", v)}
${appUrl}`;

  return { subject, html, text };
}
