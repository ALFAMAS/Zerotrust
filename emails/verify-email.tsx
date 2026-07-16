import { VerifyEmail, type VerifyEmailData } from "../src/templates/emails/verify-email";

function VerifyEmailPreview(props: VerifyEmailData) {
  return <VerifyEmail {...props} />;
}

VerifyEmailPreview.PreviewProps = {
  name: "Ada Lovelace",
  code: "739204",
  verifyUrl: "https://app.example.com/preview/verify-email",
  expiresInMinutes: 30,
  appName: "zerotrust",
} satisfies VerifyEmailData;

export default VerifyEmailPreview;
