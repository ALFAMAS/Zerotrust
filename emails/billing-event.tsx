import {
  BillingEventEmail,
  type BillingEventEmailData,
} from "../src/templates/emails/billing-event";

function BillingEventPreview(props: BillingEventEmailData) {
  return <BillingEventEmail {...props} />;
}

BillingEventPreview.PreviewProps = {
  name: "Ada Lovelace",
  title: "Your trial ends in 3 days",
  body: "Choose a plan to keep your team protected and retain access to your security history.",
  ctaLabel: "Choose a plan",
  ctaUrl: "https://app.example.com/preview/billing",
  appName: "zerotrust",
  appUrl: "https://app.example.com",
} satisfies BillingEventEmailData;

export default BillingEventPreview;
