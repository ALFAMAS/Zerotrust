import { Column, Link, Row, Section } from "@react-email/components";
import {
  EmailButton,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  palette,
  renderEmail,
  WarningNote,
} from "./components";

export interface SecurityAlertEmailData {
  name: string;
  action: string;
  device: string;
  location: string;
  time: string;
  appName: string;
  appUrl: string;
  revokeSessionUrl?: string;
}

function ActivityRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const cell = {
    padding: "12px 16px",
    borderBottom: last ? undefined : `1px solid ${palette.border}`,
  };
  return (
    <Row>
      <Column
        style={{
          ...cell,
          width: "35%",
          fontSize: "13px",
          fontWeight: 600,
          color: palette.muted,
          textTransform: "uppercase" as const,
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </Column>
      <Column style={{ ...cell, fontSize: "14px", color: palette.body }}>{value}</Column>
    </Row>
  );
}

export function SecurityAlertEmail(data: SecurityAlertEmailData) {
  const { name, action, device, location, time, appName, appUrl, revokeSessionUrl } = data;

  return (
    <EmailShell
      lang="en"
      appName={appName}
      preview={`We detected ${action} on your ${appName} account`}
      footer={
        <>
          <FooterText>
            This security alert was sent from{" "}
            <Link href={appUrl} style={{ color: palette.accent }}>
              {appName}
            </Link>
            .
          </FooterText>
          <FooterText>If you believe this is an error, contact our support team.</FooterText>
        </>
      }
    >
      <EmailHeading>Security Alert</EmailHeading>
      <EmailText>
        Hi {name}, we detected the following activity on your {appName} account:
      </EmailText>
      <Section
        style={{
          margin: "0 0 24px",
          border: `1px solid ${palette.border}`,
          borderRadius: "6px",
        }}
      >
        <ActivityRow label="Activity" value={action} />
        <ActivityRow label="Device" value={device} />
        <ActivityRow label="Location" value={location} />
        <ActivityRow label="Time" value={time} last />
      </Section>
      <WarningNote>
        <strong>If this wasn't you</strong>, your account may be compromised. Click "Secure My
        Account" immediately to revoke access and change your password.
      </WarningNote>
      {revokeSessionUrl && (
        <EmailButton href={revokeSessionUrl} color={palette.danger}>
          Secure My Account
        </EmailButton>
      )}
      <EmailButton href={appUrl} color={palette.border} textColor={palette.body}>
        This was me
      </EmailButton>
    </EmailShell>
  );
}

export async function securityAlertEmailTemplate(data: SecurityAlertEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, action, device, location, time, appName, appUrl, revokeSessionUrl } = data;

  const subject = `Security alert: ${action} on your ${appName} account`;

  const html = await renderEmail(<SecurityAlertEmail {...data} />);

  const text = `Security Alert — ${appName}

Hi ${name},

We detected the following activity on your ${appName} account:

  Activity : ${action}
  Device   : ${device}
  Location : ${location}
  Time     : ${time}

If this wasn't you, your account may be compromised.${revokeSessionUrl ? `\nSecure your account immediately: ${revokeSessionUrl}` : ""}

If this was you, no action is needed.

— The ${appName} Team
${appUrl}`;

  return { subject, html, text };
}
