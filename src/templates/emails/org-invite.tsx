import { Link } from "@react-email/components";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FinePrint,
  FooterText,
  LinkFallback,
  palette,
  renderEmail,
} from "./components";

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

export async function orgInviteEmailTemplate(data: OrgInviteEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { email, inviterName, orgName, role, acceptUrl, expiresInDays, appName, appUrl } = data;

  const subject = `${inviterName} invited you to join ${orgName} on ${appName}`;
  const dayWord = expiresInDays === 1 ? "day" : "days";

  const html = await renderEmail(
    <EmailShell
      lang="en"
      appName={appName}
      preview={`${inviterName} invited you to join ${orgName}`}
      footer={
        <FooterText>
          Sent by{" "}
          <Link href={appUrl} style={{ color: palette.accent }}>
            {appName}
          </Link>
          .
        </FooterText>
      }
    >
      <EmailHeading>You're invited to join {orgName}</EmailHeading>
      <EmailText>Hi {email},</EmailText>
      <EmailText>
        <strong>{inviterName}</strong> has invited you to join <strong>{orgName}</strong> on{" "}
        {appName} as <strong>{role}</strong>. This invite expires in {expiresInDays} {dayWord}.
      </EmailText>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
      <LinkFallback
        label="If the button above doesn't work, copy and paste this link into your browser:"
        url={acceptUrl}
      />
      <FinePrint>
        If you weren't expecting this invitation, you can safely ignore this email.
      </FinePrint>
    </EmailShell>
  );

  const text = `You're invited to join ${orgName} on ${appName}

Hi ${email},

${inviterName} has invited you to join ${orgName} on ${appName} as ${role}. This invite expires in ${expiresInDays} ${dayWord}.

Accept invitation: ${acceptUrl}

If you weren't expecting this invitation, you can safely ignore this email.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
