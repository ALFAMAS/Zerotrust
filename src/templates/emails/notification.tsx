import { Link, Text } from "@react-email/components";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  palette,
  renderEmail,
} from "./components";

export interface NotificationEmailData {
  name: string;
  title: string;
  body: string;
  link?: string;
  unsubscribeUrl?: string;
  appName: string;
  appUrl: string;
}

export function NotificationEmail(data: NotificationEmailData) {
  const { name, title, body, link, unsubscribeUrl, appName, appUrl } = data;

  return (
    <EmailShell
      lang="en"
      appName={appName}
      preview={title}
      footer={
        <>
          <FooterText>
            This notification was sent from{" "}
            <Link href={appUrl} style={{ color: palette.accent }}>
              {appName}
            </Link>
            .
          </FooterText>
          {unsubscribeUrl && (
            <Text style={{ margin: 0, fontSize: "12px", color: palette.faint }}>
              Don't want these emails?{" "}
              <Link
                href={unsubscribeUrl}
                style={{ color: palette.faint, textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
            </Text>
          )}
        </>
      }
    >
      <EmailHeading>{title}</EmailHeading>
      <EmailText>Hi {name},</EmailText>
      <EmailText>{body}</EmailText>
      {link && <EmailButton href={link}>View in app</EmailButton>}
    </EmailShell>
  );
}

export async function notificationEmailTemplate(data: NotificationEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, title, body, link, unsubscribeUrl, appName, appUrl } = data;

  const subject = `${title} — ${appName}`;

  const html = await renderEmail(<NotificationEmail {...data} />);

  const ctaText = link ? `\nView in app: ${link}\n` : "";
  const unsubLine = unsubscribeUrl ? `\nTo unsubscribe: ${unsubscribeUrl}\n` : "";

  const text = `${title}

Hi ${name},

${body}
${ctaText}
— The ${appName} Team
${appUrl}
${unsubLine}`;

  return { subject, html, text };
}
