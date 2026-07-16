import type { Locale } from "../../shared/locale";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  LinkFallback,
  renderEmail,
} from "./components";
import { htmlLang, tr } from "./i18n";

export interface WelcomeEmailData {
  name: string;
  appName: string;
  appUrl: string;
  loginUrl: string;
  locale?: Locale;
}

export function WelcomeEmail({ name, appName, loginUrl, locale }: WelcomeEmailData) {
  const v = { name, appName };
  return (
    <EmailShell
      lang={htmlLang(locale)}
      appName={appName}
      preview={tr(locale, "welcome_p1", v)}
      footer={
        <>
          <FooterText>{tr(locale, "welcome_footer_registered", v)}</FooterText>
          <FooterText>{tr(locale, "welcome_footer_ignore", v)}</FooterText>
        </>
      }
    >
      <EmailHeading>{tr(locale, "welcome_heading", v)}</EmailHeading>
      <EmailText>{tr(locale, "welcome_p1", v)}</EmailText>
      <EmailText>{tr(locale, "welcome_p2", v)}</EmailText>
      <EmailButton href={loginUrl}>{tr(locale, "welcome_cta", v)}</EmailButton>
      <LinkFallback label={tr(locale, "welcome_link_help", v)} url={loginUrl} />
    </EmailShell>
  );
}

export async function welcomeEmailTemplate(data: WelcomeEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, appName, appUrl, loginUrl, locale } = data;
  const v = { name, appName };

  const subject = tr(locale, "welcome_subject", v);

  const html = await renderEmail(<WelcomeEmail {...data} />);

  const text = `${tr(locale, "welcome_heading", v)}

${tr(locale, "welcome_p1", v)}

${tr(locale, "welcome_cta", v)}:
${loginUrl}

${tr(locale, "welcome_footer_ignore", v)}

${tr(locale, "welcome_team", v)}
${appUrl}`;

  return { subject, html, text };
}
