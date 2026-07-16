import type { Locale } from "../../shared/locale";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  LinkFallback,
  renderEmail,
  WarningNote,
} from "./components";
import { htmlLang, tr } from "./i18n";

export interface PasswordResetEmailData {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
  appName: string;
  appUrl: string;
  locale?: Locale;
}

export async function passwordResetEmailTemplate(data: PasswordResetEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, resetUrl, expiresInMinutes, appName, appUrl, locale } = data;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    tr(locale, key, { ...vars, name, appName, appUrl, minutes: expiresInMinutes });
  const subject = t("reset_subject");

  const html = await renderEmail(
    <EmailShell
      lang={htmlLang(locale)}
      appName={appName}
      preview={t("reset_p1")}
      footer={
        <>
          <FooterText>{t("reset_footer")}</FooterText>
          <FooterText>{t("reset_valid")}</FooterText>
        </>
      }
    >
      <EmailHeading>{t("reset_heading")}</EmailHeading>
      <EmailText>{t("reset_p1")}</EmailText>
      <EmailText>{t("reset_p2")}</EmailText>
      <EmailButton href={resetUrl}>{t("reset_cta")}</EmailButton>
      <LinkFallback label={t("reset_link_help")} url={resetUrl} />
      <WarningNote>{t("reset_security")}</WarningNote>
    </EmailShell>
  );

  const text = `${t("reset_heading")}

${t("reset_p1")}

${t("reset_cta")}: ${resetUrl}

${t("reset_security")}

${t("reset_team")}
${appUrl}`;

  return { subject, html, text };
}
