import type { Locale } from "../../shared/locale";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FinePrint,
  FooterText,
  LinkFallback,
  renderEmail,
} from "./components";
import { htmlLang, tr } from "./i18n";

export interface MagicLinkEmailData {
  name: string;
  magicLinkUrl: string;
  expiresInMinutes: number;
  appName: string;
  appUrl: string;
  locale?: Locale;
}

export function MagicLinkEmail({
  name,
  magicLinkUrl,
  expiresInMinutes,
  appName,
  appUrl,
  locale,
}: MagicLinkEmailData) {
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    tr(locale, key, { ...vars, name, appName, appUrl, minutes: expiresInMinutes });
  return (
    <EmailShell
      lang={htmlLang(locale)}
      appName={appName}
      preview={t("magiclink_p1")}
      footer={
        <>
          <FooterText>{t("magiclink_footer")}</FooterText>
          <FooterText>{t("magiclink_valid")}</FooterText>
        </>
      }
    >
      <EmailHeading>{t("magiclink_heading")}</EmailHeading>
      <EmailText>{t("magiclink_p1")}</EmailText>
      <EmailText>{t("magiclink_p2")}</EmailText>
      <EmailButton href={magicLinkUrl}>{t("magiclink_cta")}</EmailButton>
      <LinkFallback label={t("magiclink_link_help")} url={magicLinkUrl} />
      <FinePrint>{t("magiclink_ignore")}</FinePrint>
    </EmailShell>
  );
}

export async function magicLinkEmailTemplate(data: MagicLinkEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, magicLinkUrl, expiresInMinutes, appName, appUrl, locale } = data;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    tr(locale, key, { ...vars, name, appName, appUrl, minutes: expiresInMinutes });
  const subject = t("magiclink_subject");

  const html = await renderEmail(<MagicLinkEmail {...data} />);

  const text = `${t("magiclink_heading")}

${t("magiclink_p1")}

${t("magiclink_cta")}: ${magicLinkUrl}

${t("magiclink_ignore")}

${t("magiclink_team")}
${appUrl}`;

  return { subject, html, text };
}
