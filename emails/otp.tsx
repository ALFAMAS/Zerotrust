import { OtpEmail, type OtpEmailData } from "../src/templates/emails/otp";

function OtpPreview(props: OtpEmailData) {
  return <OtpEmail {...props} />;
}

OtpPreview.PreviewProps = {
  name: "Ada Lovelace",
  code: "482193",
  expiresInMinutes: 10,
  appName: "zerotrust",
} satisfies OtpEmailData;

export default OtpPreview;
