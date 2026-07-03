import {
  Activity,
  ArrowRight,
  Building2,
  CreditCard,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  Mail,
  RadioTower,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  UserCog,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: KeyRound,
    title: "PASETO tokens",
    desc: "Platform-agnostic security tokens with AES-256-GCM. None of the JWT algorithm footguns.",
  },
  {
    icon: Fingerprint,
    title: "WebAuthn passkeys",
    desc: "Phishing-resistant biometric and hardware-key sign-in. Fully FIDO2 compliant.",
  },
  {
    icon: Smartphone,
    title: "Multi-factor auth",
    desc: "TOTP, email OTP, SMS, WhatsApp and Telegram challenges — adaptive and built in.",
  },
  {
    icon: ShieldCheck,
    title: "Zero-trust sessions",
    desc: "Continuous access evaluation, device binding and proof-of-possession on every request.",
  },
  {
    icon: Activity,
    title: "Anomaly detection",
    desc: "Real-time risk scoring that can step-up, revoke or quarantine a session automatically.",
  },
  {
    icon: UserCog,
    title: "RBAC + ABAC",
    desc: "Role hierarchies, attribute conditions, just-in-time escalation and geo-fencing.",
  },
  {
    icon: Mail,
    title: "Magic links",
    desc: "Passwordless single-use email sign-in — no password to phish or leak.",
  },
  {
    icon: Globe,
    title: "Social & OAuth",
    desc: "Google, GitHub, and Facebook providers wired up out of the box.",
  },
  {
    icon: RadioTower,
    title: "OIDC provider",
    desc: `Expose ${brand.name} as a standards-compliant OpenID Connect identity provider.`,
  },
  {
    icon: Building2,
    title: "SAML 2.0 SSO",
    desc: "SP-initiated single sign-on for enterprise IdPs — Okta, Azure AD, Google Workspace.",
  },
  {
    icon: Users,
    title: "Organizations & teams",
    desc: "Multi-tenant orgs with roles, seats, invitations and custom permission sets.",
  },
  {
    icon: Webhook,
    title: "API keys & webhooks",
    desc: "Scoped API keys and signed, retryable event webhooks for every integration.",
  },
];

const alsoIncluded = [
  { icon: ScrollText, label: "Tamper-aware audit logs (Elasticsearch)" },
  { icon: CreditCard, label: "Stripe billing, trials & MRR/ARR dashboards" },
  { icon: ShieldAlert, label: "HaveIBeenPwned breach checks" },
  { icon: RadioTower, label: "Shared Signals Framework (SSF)" },
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
  { step: "01", title: "Clone & configure", code: "cp .env.example .env   # add your secrets" },
  { step: "02", title: "Start the stack", code: "docker compose up -d" },
  { step: "03", title: "Open the app", code: `open ${brand.url}` },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
              style={{ backgroundColor: brand.logoColor }}
            >
              {brand.logoLetter}
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              {brand.name}
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#features"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Features
            </a>
            <a
              href={`${brand.apiUrl}/docs`}
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Docs
            </a>
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="bg-grid mask-fade pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-[-10rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full opacity-30 blur-[160px]"
          style={{ background: brand.color }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-24 text-center sm:pt-28">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            {brand.announcementBadge}
          </div>

          <h1
            className="animate-fade-up font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            {brand.heroTitle}
            <br />
            <span className="text-primary">{brand.heroSubtitle}</span>
          </h1>

          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            {brand.heroDescription}
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-8 text-base")}>
              Start free
              <ArrowRight />
            </Link>
            <a
              href={`${brand.apiUrl}/docs`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-8 text-base")}
            >
              View API docs
            </a>
          </div>

          {/* Quick request preview */}
          <div
            className="animate-fade-up mx-auto mt-14 max-w-2xl overflow-hidden rounded-xl border border-border bg-card/70 text-left shadow-2xl backdrop-blur-sm"
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-destructive/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">authenticate.sh</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-muted-foreground">
              <code>
                <span className="text-primary">curl</span> -X POST {brand.apiUrl}/auth/login \{"\n"}
                {"  "}-H{" "}
                <span className="text-emerald-400">&apos;Content-Type: application/json&apos;</span>{" "}
                \{"\n"}
                {"  "}-d{" "}
                <span className="text-emerald-400">
                  &apos;{`{"email":"you@example.com","password":"••••"}`}&apos;
                </span>
                {"\n\n"}
                <span className="text-muted-foreground/60"># → 200 OK</span>
                {"\n"}
                {`{ `}
                <span className="text-foreground">&quot;accessToken&quot;</span>:{" "}
                <span className="text-emerald-400">&quot;v4.local.…&quot;</span>,{" "}
                <span className="text-foreground">&quot;mfaRequired&quot;</span>:{" "}
                <span className="text-primary">false</span> {`}`}
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-20">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything you need to ship secure auth
          </h2>
          <p className="mt-3 text-muted-foreground">
            One self-hosted platform — no third-party dependency on your critical auth path.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-primary transition-colors group-hover:border-primary/40">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="font-medium text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Also included */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {alsoIncluded.map((a) => (
            <div
              key={a.label}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3"
            >
              <a.icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">{a.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Standards strip ──────────────────────────────────────────────── */}
      <section className="border-y border-border/60 bg-card/30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Standards-first
          </span>
          {standards.map((s) => (
            <span key={s} className="font-mono text-sm text-foreground/80">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── Quickstart ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Running in minutes
          </h2>
          <p className="mt-3 text-muted-foreground">
            Self-host the whole stack with three commands.
          </p>
        </div>
        <div className="space-y-5">
          {steps.map((s) => (
            <div key={s.step} className="flex items-start gap-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card font-mono text-sm font-semibold text-primary">
                {s.step}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-foreground">{s.title}</h3>
                <code className="mt-2 block overflow-x-auto rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-sm text-foreground/90">
                  {s.code}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 text-center sm:p-16">
          <div
            className="bg-grid mask-fade pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
            style={{ background: brand.color }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Own your auth stack
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Self-hosted. Open source. No vendor lock-in, no per-MAU surprises.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className={cn(buttonVariants({ size: "lg" }), "px-8 text-base")}
              >
                Create your account
                <ArrowRight />
              </Link>
              <a
                href={brand.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-8 text-base")}
              >
                <Star />
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col justify-between gap-10 md:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
                  style={{ backgroundColor: brand.logoColor }}
                >
                  {brand.logoLetter}
                </div>
                <span className="font-display text-lg font-semibold text-foreground">
                  {brand.name}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Self-hosted, open source under {brand.license}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Product</h4>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <a
                      href="#features"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Features
                    </a>
                  </li>
                  <li>
                    <Link
                      href="/status"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Status
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">Resources</h4>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <a
                      href={`${brand.apiUrl}/docs`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Docs
                    </a>
                  </li>
                  <li>
                    <Link
                      href="/help"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Help
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">Legal</h4>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link
                      href="/privacy"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Privacy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Terms
                    </Link>
                  </li>
                  <li>
                    <a
                      href={brand.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      GitHub
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            © {brand.copyrightYear} {brand.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
