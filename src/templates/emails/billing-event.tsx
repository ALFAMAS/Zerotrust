import { Link } from "@react-email/components";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  palette,
  renderEmail,
} from "./components";

export interface BillingEventEmailData {
  name: string;
  /** Email headline, e.g. "Your trial ends in 3 days" */
  title: string;
  /** Main paragraph (plain text, no HTML) */
  body: string;
  /** Optional call-to-action button */
  ctaLabel?: string;
  ctaUrl?: string;
  appName: string;
  appUrl: string;
}

export async function billingEventEmailTemplate(data: BillingEventEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, title, body, ctaLabel, ctaUrl, appName, appUrl } = data;

  const subject = `${title} — ${appName}`;

  const html = await renderEmail(
    <EmailShell
      lang="en"
      appName={appName}
      preview={title}
      footer={
        <FooterText>
          Sent by{" "}
          <Link href={appUrl} style={{ color: palette.accent }}>
            {appName}
          </Link>{" "}
          · Manage billing in your{" "}
          <Link href={`${appUrl}/dashboard/billing`} style={{ color: palette.accent }}>
            dashboard
          </Link>
          .
        </FooterText>
      }
    >
      <EmailHeading>{title}</EmailHeading>
      <EmailText>Hi {name},</EmailText>
      <EmailText>{body}</EmailText>
      {ctaLabel && ctaUrl && <EmailButton href={ctaUrl}>{ctaLabel}</EmailButton>}
    </EmailShell>
  );

  const text = `${title} — ${appName}

Hi ${name},

${body}
${ctaLabel && ctaUrl ? `\n${ctaLabel}: ${ctaUrl}\n` : ""}
— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
