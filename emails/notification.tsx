import {
  NotificationEmail,
  type NotificationEmailData,
} from "../src/templates/emails/notification";

function NotificationPreview(props: NotificationEmailData) {
  return <NotificationEmail {...props} />;
}

NotificationPreview.PreviewProps = {
  name: "Ada Lovelace",
  title: "Your monthly security report is ready",
  body: "We found no critical account risks this month. Review the report for the full activity summary.",
  link: "https://app.example.com/preview/security-report",
  unsubscribeUrl: "https://app.example.com/preview/email-preferences",
  appName: "zerotrust",
  appUrl: "https://app.example.com",
} satisfies NotificationEmailData;

export default NotificationPreview;
