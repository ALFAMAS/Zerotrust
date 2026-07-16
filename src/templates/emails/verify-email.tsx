import type { Locale } from "../../shared/locale";
import {
  CodeBox,
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  LinkFallback,
  renderEmail,
} from "./components";
import { htmlLang, tr } from "./i18n";

export interface VerifyEmailData {
  name: string;
  code: string;
  verifyUrl: string;
  expiresInMinutes: number;
  appName: string;
  locale?: Locale;
}

export function VerifyEmail(data: VerifyEmailData) {
  const { name, code, verifyUrl, expiresInMinutes, appName, locale } = data;
  const v = { name, appName, minutes: expiresInMinutes };

  return (
    <EmailShell
      lang={htmlLang(locale)}
      appName={appName}
      preview={tr(locale, "verify_p1", v)}
      footer={<FooterText>{tr(locale, "verify_ignore", v)}</FooterText>}
    >
      <EmailHeading>{tr(locale, "verify_heading", v)}</EmailHeading>
      <EmailText>{tr(locale, "verify_p1", v)}</EmailText>
      <EmailButton href={verifyUrl}>{tr(locale, "verify_cta", v)}</EmailButton>
      <EmailText muted>{tr(locale, "verify_or_code", v)}</EmailText>
      <CodeBox code={code} />
      <LinkFallback label={tr(locale, "verify_link_help", v)} url={verifyUrl} />
    </EmailShell>
  );
}

export async function verifyEmailTemplate(data: VerifyEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, code, verifyUrl, expiresInMinutes, appName, locale } = data;
  const v = { name, appName, minutes: expiresInMinutes };

  const subject = tr(locale, "verify_subject", v);

  const html = await renderEmail(<VerifyEmail {...data} />);

  const text = `${tr(locale, "verify_heading", v)}

${tr(locale, "verify_p1", v)}

${verifyUrl}

${tr(locale, "verify_or_code", v)}
${code}

${tr(locale, "verify_ignore", v)}`;

  return { subject, html, text };
}
