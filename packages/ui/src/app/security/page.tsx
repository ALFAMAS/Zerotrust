import type { Metadata } from "next";
import { brand } from "@/config/brand";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: `Security & Responsible Disclosure — ${brand.name}`,
  description: `Report a security vulnerability in ${brand.name} and learn about our disclosure policy.`,
};

const contact = process.env.NEXT_PUBLIC_SECURITY_CONTACT ?? "security@example.com";

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          Security &amp; Responsible Disclosure
        </h1>
        <p className="mb-12 mt-3 text-sm text-muted-foreground">
          We welcome reports from security researchers and treat them as a priority.
        </p>

        <div className="space-y-10 leading-relaxed text-foreground/80">
          <section>
            <h2 className="mb-4 border-b border-border pb-2 text-xl font-semibold text-foreground">
              Reporting a vulnerability
            </h2>
            <p className="mb-3">
              Email <a className="text-primary" href={`mailto:${contact}`}>{contact}</a> with a
              description, reproduction steps, and impact. Encrypt sensitive details if possible.
              Our machine-readable policy is published at{" "}
              <a className="text-primary" href="/.well-known/security.txt">
                /.well-known/security.txt
              </a>{" "}
              (RFC 9116).
            </p>
          </section>

          <section>
            <h2 className="mb-4 border-b border-border pb-2 text-xl font-semibold text-foreground">
              Our commitment
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>We acknowledge reports within 3 business days.</li>
              <li>We&apos;ll keep you updated on remediation progress.</li>
              <li>
                We won&apos;t pursue legal action for good-faith research that respects the scope
                and safe-harbor terms below.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 border-b border-border pb-2 text-xl font-semibold text-foreground">
              Scope &amp; safe harbor
            </h2>
            <p className="mb-3">
              In scope: the {brand.name} application and API. Please avoid privacy violations,
              data destruction, and service degradation (no automated DoS or bulk scanning).
              Use only test accounts you control. Give us reasonable time to remediate before any
              public disclosure.
            </p>
            <p>
              Good-faith testing that follows this policy is authorized, and we consider it exempt
              from anti-hacking statutes and our acceptable-use terms.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
