import { WelcomeEmail, type WelcomeEmailData } from "../src/templates/emails/welcome";

function WelcomePreview(props: WelcomeEmailData) {
  return <WelcomeEmail {...props} />;
}

WelcomePreview.PreviewProps = {
  name: "Ada Lovelace",
  appName: "zerotrust",
  appUrl: "https://app.example.com",
  loginUrl: "https://app.example.com/preview/login",
} satisfies WelcomeEmailData;

export default WelcomePreview;
