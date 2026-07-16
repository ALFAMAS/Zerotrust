import { OrgInviteEmail, type OrgInviteEmailData } from "../src/templates/emails/org-invite";

function OrgInvitePreview(props: OrgInviteEmailData) {
  return <OrgInviteEmail {...props} />;
}

OrgInvitePreview.PreviewProps = {
  email: "ada@example.com",
  inviterName: "Grace Hopper",
  orgName: "Analytical Engines",
  role: "Administrator",
  acceptUrl: "https://app.example.com/preview/invitation",
  expiresInDays: 7,
  appName: "zerotrust",
  appUrl: "https://app.example.com",
} satisfies OrgInviteEmailData;

export default OrgInvitePreview;
