import { MagicLinkEmail, type MagicLinkEmailData } from "../src/templates/emails/magic-link";

function MagicLinkPreview(props: MagicLinkEmailData) {
  return <MagicLinkEmail {...props} />;
}

MagicLinkPreview.PreviewProps = {
  name: "Ada Lovelace",
  magicLinkUrl: "https://app.example.com/preview/magic-link",
  expiresInMinutes: 15,
  appName: "zerotrust",
  appUrl: "https://app.example.com",
} satisfies MagicLinkEmailData;

export default MagicLinkPreview;
