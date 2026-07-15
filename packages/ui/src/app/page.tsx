import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Fingerprint,
  Globe,
  KeyRound,
  Mail,
  RadioTower,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Terminal,
  UserCog,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: KeyRound,
    title: "PASETO tokens",
    description:
      "Platform-agnostic security tokens with AES-256-GCM and none of the JWT algorithm footguns.",
  },
  {
    icon: Fingerprint,
    title: "WebAuthn passkeys",
    description: "Phishing-resistant biometric and hardware-key sign-in with full FIDO2 support.",
  },
  {
    icon: Smartphone,
    title: "Multi-factor auth",
    description: "TOTP, email OTP, SMS, WhatsApp, and Telegram challenges, adaptive and built in.",
  },
  {
    icon: ShieldCheck,
    title: "Zero-trust sessions",
    description:
      "Continuous access evaluation, device binding, and proof-of-possession on every request.",
  },
  {
    icon: Activity,
    title: "Anomaly detection",
    description:
      "Real-time risk scoring that can step up, revoke, or quarantine a session automatically.",
  },
  {
    icon: UserCog,
    title: "RBAC + ABAC",
    description: "Role hierarchies, attribute conditions, just-in-time escalation, and geofencing.",
  },
  {
    icon: Mail,
    title: "Magic links",
    description: "Passwordless, single-use email sign-in with no password to phish or leak.",
  },
  {
    icon: Globe,
    title: "Social and OAuth",
    description: "Google, GitHub, and Facebook providers wired up out of the box.",
  },
  {
    icon: RadioTower,
    title: "OIDC provider",
    description: `Expose ${brand.name} as a standards-compliant OpenID Connect identity provider.`,
  },
  {
    icon: Building2,
    title: "SAML 2.0 SSO",
    description: "SP-initiated SSO for Okta, Microsoft Entra ID, and Google Workspace.",
  },
  {
    icon: Users,
    title: "Organizations and teams",
    description:
      "Multi-tenant organizations with roles, seats, invitations, and custom permissions.",
  },
  {
    icon: Webhook,
    title: "API keys and webhooks",
    description: "Scoped API keys and signed, retryable event webhooks for every integration.",
  },
];

const alsoIncluded = [
  { icon: ScrollText, label: "Tamper-aware audit logs" },
  { icon: CreditCard, label: "Billing and revenue dashboards" },
  { icon: ShieldAlert, label: "Compromised-password checks" },
  { icon: RadioTower, label: "Shared Signals Framework" },
];

const standards = [
  "PASETO",
  "FIDO2 / WebAuthn",
  "OAuth 2.1",
  "OpenID Connect",
  "SAML 2.0",
  "SCIM-ready",
];

const steps = [
  { step: "01", title: "Clone and configure", code: "cp .env.example .env" },
  { step: "02", title: "Start the stack", code: "docker compose up -d" },
  { step: "03", title: "Open the app", code: `open ${brand.url}` },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.86fr)] lg:items-center lg:px-8 lg:py-8">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-control bg-surface px-3 py-2 text-xs font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                {brand.announcementBadge}
              </p>

              <h1 className="mt-6 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-3xl">
                Ship secure auth. <span className="text-secondary-action">Keep control.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
                {brand.heroDescription}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-6")}>
                  Start free
                  <ArrowRight aria-hidden="true" />
                </Link>
                <a
                  href={`${brand.apiUrl}/docs`}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
                >
                  View API docs
                </a>
              </div>

              <ul
                aria-label="Platform benefits"
                className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3"
              >
                {["Self-hosted", "Open source", "No per-user pricing"].map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Terminal className="h-4 w-4 text-secondary-action" aria-hidden="true" />
                  Authenticate request
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-success-subtle px-3 py-1 text-xs font-semibold text-success-subtle-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  200 OK
                </span>
              </div>
              <pre className="overflow-x-auto bg-muted p-6 font-mono text-xs leading-6 text-foreground sm:text-sm">
                <code>{`curl -X POST ${brand.apiUrl}/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"you@example.com","password":"••••"}'

{
  "accessToken": "v4.local.…",
  "mfaRequired": false
}`}</code>
              </pre>
              <p className="flex items-start gap-2 border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                Tokens stay in secure headers and cookies, never redirect URLs.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="standards-heading" className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6 lg:px-8">
            <h2
              id="standards-heading"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Standards-first
            </h2>
            {standards.map((standard) => (
              <span key={standard} className="font-mono text-xs font-medium text-foreground">
                {standard}
              </span>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-7xl scroll-mt-8 px-4 py-8 sm:px-6 sm:py-8 lg:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-secondary-action">Authentication platform</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you need for trusted identity
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              One self-hosted platform with no third-party dependency in your critical auth path.
            </p>
          </div>

          <div className="mt-8 grid overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="border-b border-border p-6 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-control bg-muted text-secondary-action">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {alsoIncluded.map((item) => (
              <li
                key={item.label}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
              >
                <item.icon className="h-4 w-4 shrink-0 text-secondary-action" aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-8 lg:grid-cols-[0.72fr_1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold text-secondary-action">Simple operations</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Running in minutes
              </h2>
              <p className="mt-3 max-w-md text-base leading-7 text-muted-foreground">
                Configure and launch the complete stack with three predictable commands.
              </p>
            </div>

            <ol className="space-y-4">
              {steps.map((item) => (
                <li key={item.step} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-control bg-muted font-mono text-sm font-semibold text-secondary-action">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <code className="mt-2 block overflow-x-auto rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs text-foreground sm:text-sm">
                      {item.code}
                    </code>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8">
          <div className="rounded-xl border border-border bg-muted px-6 py-8 text-center sm:px-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Own your auth stack
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              Self-hosted, open source, and free from vendor lock-in or per-user surprises.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-6")}>
                Create your account
                <ArrowRight aria-hidden="true" />
              </Link>
              <a
                href={brand.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
              >
                <Star aria-hidden="true" />
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
