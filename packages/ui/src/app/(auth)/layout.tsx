import { ArrowLeft, Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";

const footerLinks = [
  { href: "/help", label: "Help" },
  { href: "/status", label: "Status" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const highlights = [
  {
    icon: KeyRound,
    title: "PASETO sessions",
    desc: "Tamper-evident tokens without shared signing secrets.",
  },
  {
    icon: Fingerprint,
    title: "WebAuthn passkeys",
    desc: "Phishing-resistant sign-in backed by device hardware.",
  },
  {
    icon: ShieldCheck,
    title: "Adaptive MFA",
    desc: "Risk-scored challenges with real-time anomaly detection.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1.1fr)]">
      <aside className="hidden border-e border-border bg-muted lg:flex lg:flex-col lg:justify-between lg:p-8 xl:p-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 rounded-lg">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary font-display text-base font-bold text-primary-foreground">
              {brand.logoLetter}
            </span>
            <span className="font-display text-xl font-semibold text-foreground">{brand.name}</span>
          </Link>

          <div className="mt-8 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary-action">
              Self-hosted identity
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-foreground">
              Secure access without surrendering control.
            </h2>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
              {brand.description}
            </p>
          </div>

          <ul className="mt-8 max-w-lg divide-y divide-border border-y border-border">
            {highlights.map((highlight) => (
              <li key={highlight.title} className="flex gap-4 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-control bg-surface text-secondary-action">
                  <highlight.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{highlight.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {highlight.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Self-hosted · {brand.license} licensed · © {brand.copyrightYear} {brand.name}
        </p>
      </aside>

      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
              {brand.logoLetter}
            </span>
            <span className="font-display text-base font-semibold text-foreground">
              {brand.name}
            </span>
          </Link>
          <Link
            href="/"
            className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </header>

        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6"
        >
          <div className="w-full max-w-md">
            <div className="rounded-xl border border-border bg-surface p-6 text-foreground shadow-none sm:p-8">
              {children}
            </div>

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-secondary-action" aria-hidden="true" />
              Protected by {brand.name} · zero-trust by default
            </p>
          </div>
        </main>

        <footer className="border-t border-border bg-surface px-4 py-6 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
            <span>
              © {brand.copyrightYear} {brand.name} · {brand.license} licensed
            </span>
            <nav aria-label="Authentication footer" className="flex flex-wrap justify-center gap-4">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="underline underline-offset-4 hover:text-foreground hover:no-underline"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href={brand.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground hover:no-underline"
              >
                GitHub
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
