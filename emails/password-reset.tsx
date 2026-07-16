import {
  PasswordResetEmail,
  type PasswordResetEmailData,
} from "../src/templates/emails/password-reset";

function PasswordResetPreview(props: PasswordResetEmailData) {
  return <PasswordResetEmail {...props} />;
}

PasswordResetPreview.PreviewProps = {
  name: "Ada Lovelace",
  resetUrl: "https://app.example.com/preview/password-reset",
  expiresInMinutes: 30,
  appName: "zerotrust",
  appUrl: "https://app.example.com",
} satisfies PasswordResetEmailData;

export default PasswordResetPreview;
