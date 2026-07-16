import { ArrowRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { formatPlanPrice } from "@/config/pricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: `Pricing — ${brand.name}`,
  description: `Simple, predictable plans for ${brand.name}: a free tier for small teams, Pro for growing products, and Enterprise for custom domains, branding, and unlimited usage.`,
};

// Public mirror of the server-side plan gates in `src/shared/plans.ts`
// (PLAN_CONFIGS). Keep the two in sync when plan limits change.
const tiers = [
  {
    name: "Free",
    price: formatPlanPrice("free"),
    tagline: "Every core auth feature, sized for side projects and small teams.",
    cta: "Start free",
    href: "/register",
    highlighted: false,
    features: [
      "All sign-in methods — passwords, OAuth, magic links, passkeys, TOTP",
      "Up to 5 organization members",
      "2 API keys",
      "10,000 API calls per month",
      "100 MB storage",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: formatPlanPrice("pro"),
    tagline: "For growing products that need real access control and an audit trail.",
    cta: "Start with Pro",
    href: "/register",
    highlighted: true,
    features: [
      "Everything in Free",
      "Up to 50 organization members",
      "20 API keys",
      "1,000,000 API calls per month",
      "10 GB storage",
      "Custom roles with fine-grained permissions",
      "Tamper-evident audit log",
      "Advanced MFA policies",
      "14-day trial",
    ],
  },
  {
    name: "Enterprise",
    price: formatPlanPrice("enterprise"),
    tagline: "For organizations that need custom domains, compliance surfaces, and no ceilings.",
    cta: "Start with Enterprise",
    href: "/register",
    highlighted: false,
    features: [
      "Everything in Pro",
      "Unlimited members, API keys, calls, and storage",
      "Custom domains and branding",
      "SCIM provisioning",
      "SOC 2 readiness and compliance consoles",
      "Priority support",
    ],
  },
];

const comparison: { label: string; values: [string, string, string] }[] = [
  { label: "Organization members", values: ["5", "50", "Unlimited"] },
  { label: "API keys", values: ["2", "20", "Unlimited"] },
  { label: "API calls / month", values: ["10,000", "1,000,000", "Unlimited"] },
  { label: "Storage", values: ["100 MB", "10 GB", "Unlimited"] },
  { label: "Custom roles", values: ["—", "Included", "Included"] },
  { label: "Audit log", values: ["—", "Included", "Included"] },
  { label: "Advanced MFA", values: ["—", "Included", "Included"] },
  { label: "Custom domains", values: ["—", "—", "Included"] },
  { label: "Priority support", values: ["—", "—", "Included"] },
];

const faqs = [
  {
    question: "Is the self-hosted version really free?",
    answer:
      "Yes. The codebase is MIT-licensed — clone it, brand it, and run every feature yourself with no license fee. These plans apply when you monetize your own deployment with the built-in Stripe billing.",
  },
  {
    question: "How does billing work?",
    answer:
      "Subscriptions are per organization, handled by Stripe Checkout with a self-service customer portal for upgrades, downgrades, invoices, and cancellation. Webhook handling is idempotent and replay-safe.",
  },
  {
    question: "Do paid plans have a trial?",
    answer:
      "Pro includes a 14-day trial. If a payment later fails, dunning emails and a grace period run automatically before any downgrade to Free.",
  },
  {
    question: "Can I pay in my own currency?",
    answer:
      "Multi-currency pricing, purchasing-power-parity discounts, tax quotes, and VAT validation are built in — prices localize to your currency and country at checkout.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8">
            <p className="text-sm font-semibold text-secondary-action">Pricing</p>
            <h1 className="mt-2 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight">
              Predictable plans that scale with your product
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Every plan includes the full authentication platform — passwords, passkeys, MFA,
              organizations, and anomaly detection. Paid tiers raise limits and unlock access
              control, audit, and custom domains.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="plans-heading"
          className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8"
        >
          <h2 id="plans-heading" className="sr-only">
            Plans
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {tiers.map((tier) => (
              <article
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-xl border bg-surface p-6",
                  tier.highlighted ? "border-primary" : "border-border"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{tier.name}</h3>
                  {tier.highlighted && (
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="mt-4 font-display text-4xl font-semibold tracking-tight">
                  {tier.price}
                  <span className="text-sm font-normal text-muted-foreground"> /month</span>
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{tier.tagline}</p>

                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={cn(
                    buttonVariants({ variant: tier.highlighted ? "default" : "outline" }),
                    "mt-8 w-full"
                  )}
                >
                  {tier.cta}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Prices in USD. Multi-currency and purchasing-power-parity pricing apply automatically at
            checkout. Self-hosting the open-source codebase is free under the {brand.license}{" "}
            license.
          </p>
        </section>

        <section aria-labelledby="comparison-heading" className="border-y border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8">
            <h2
              id="comparison-heading"
              className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Compare plans
            </h2>

            <div className="mt-8 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[36rem] border-collapse bg-background text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                      Feature
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                      Free
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                      Pro
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                      Enterprise
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-b-0">
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        {row.label}
                      </th>
                      {row.values.map((value, i) => (
                        <td
                          key={`${row.label}-${["free", "pro", "enterprise"][i]}`}
                          className="px-4 py-3 text-muted-foreground"
                        >
                          {value === "Included" ? (
                            <span className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-success" aria-hidden="true" />
                              <span className="sr-only">Included</span>
                            </span>
                          ) : value === "—" ? (
                            <span className="flex items-center gap-2">
                              <Minus className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Not included</span>
                            </span>
                          ) : (
                            value
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="faq-heading"
          className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8"
        >
          <h2
            id="faq-heading"
            className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Pricing questions
          </h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-xl border border-border bg-surface p-6">
                <dt className="text-base font-semibold">{faq.question}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-border bg-muted px-6 py-8 text-center sm:px-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Start on Free, upgrade when you grow
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              No credit card required. Upgrade, downgrade, or cancel any time from the billing
              portal.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-6")}>
                Create your account
                <ArrowRight aria-hidden="true" />
              </Link>
              <a
                href={`${brand.apiUrl}/docs`}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
              >
                View API docs
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
