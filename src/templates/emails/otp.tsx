import {
  CodeBox,
  EmailHeading,
  EmailShell,
  EmailText,
  FooterText,
  renderEmail,
} from "./components";

export interface OtpEmailData {
  name: string;
  code: string;
  expiresInMinutes: number;
  appName: string;
}

export async function otpEmailTemplate(data: OtpEmailData): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const { name, code, expiresInMinutes, appName } = data;

  const subject = `Your verification code: ${code}`;

  const html = await renderEmail(
    <EmailShell
      lang="en"
      appName={appName}
      preview={`Your verification code expires in ${expiresInMinutes} minutes`}
      footer={
        <>
          <FooterText>This code was requested for your {appName} account.</FooterText>
          <FooterText>If you didn't request this, you can safely ignore this email.</FooterText>
        </>
      }
    >
      <EmailHeading>Hi, {name}!</EmailHeading>
      <EmailText>
        Enter this code to verify your identity. It expires in {expiresInMinutes} minutes.
      </EmailText>
      <CodeBox code={code} />
      <EmailText muted>
        Do not share this code with anyone. {appName} will never ask you for this code.
      </EmailText>
    </EmailShell>
  );

  const text = `Hi ${name},

Your ${appName} verification code is:

${code}

Enter this code to verify your identity. It expires in ${expiresInMinutes} minutes.

Do not share this code with anyone. ${appName} will never ask you for this code.

If you didn't request this, you can safely ignore this email.`;

  return { subject, html, text };
}
