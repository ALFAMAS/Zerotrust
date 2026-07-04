"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailTemplate = verifyEmailTemplate;
const i18n_1 = require("./i18n");
function verifyEmailTemplate(data) {
    const { name, code, verifyUrl, expiresInMinutes, appName, locale } = data;
    const v = { name, appName, minutes: expiresInMinutes };
    const subject = (0, i18n_1.tr)(locale, "verify_subject", v);
    const html = `<!DOCTYPE html>
<html lang="${(0, i18n_1.htmlLang)(locale)}">
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
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${(0, i18n_1.tr)(locale, "verify_heading", v)}</h2>
              <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">
                ${(0, i18n_1.tr)(locale, "verify_p1", v)}
              </p>
              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;">
                      ${(0, i18n_1.tr)(locale, "verify_cta", v)}
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Code -->
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;text-align:center;">${(0, i18n_1.tr)(locale, "verify_or_code", v)}</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px;">
                <tr>
                  <td align="center" style="background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#6366f1;">${code}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:22px;color:#9ca3af;word-break:break-all;">
                ${(0, i18n_1.tr)(locale, "verify_link_help", v)}<br />
                <a href="${verifyUrl}" style="color:#6366f1;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">
                ${(0, i18n_1.tr)(locale, "verify_ignore", v)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const text = `${(0, i18n_1.tr)(locale, "verify_heading", v)}

${(0, i18n_1.tr)(locale, "verify_p1", v)}

${verifyUrl}

${(0, i18n_1.tr)(locale, "verify_or_code", v)}
${code}

${(0, i18n_1.tr)(locale, "verify_ignore", v)}`;
    return { subject, html, text };
}
//# sourceMappingURL=verify-email.js.map