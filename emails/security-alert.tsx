import {
  SecurityAlertEmail,
  type SecurityAlertEmailData,
} from "../src/templates/emails/security-alert";

function SecurityAlertPreview(props: SecurityAlertEmailData) {
  return <SecurityAlertEmail {...props} />;
}

SecurityAlertPreview.PreviewProps = {
  name: "Ada Lovelace",
  action: "a new sign-in",
  device: "Firefox on macOS",
  location: "Sydney, Australia",
  time: "16 July 2026 at 10:30 AEST",
  appName: "zerotrust",
  appUrl: "https://app.example.com",
  revokeSessionUrl: "https://app.example.com/preview/secure-account",
} satisfies SecurityAlertEmailData;

export default SecurityAlertPreview;
