import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brand } from "@/config/brand";
import { legal } from "@/config/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${brand.name}`,
  description: `Learn how ${brand.name} collects, uses, and protects your personal data.`,
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mb-8 mt-3 text-sm text-muted-foreground">
          Last updated: {legal.privacyEffectiveDate}
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          {/* 1 — Data Collection */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              1. Data We Collect
            </h2>
            <p className="mb-3">
              When you use {legal.companyName} we may collect the following categories of
              information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <span className="text-foreground/80 font-medium">Account information</span> — email
                address, display name, and hashed passwords when you register.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Authentication data</span> — TOTP
                seeds, WebAuthn credential IDs (public keys only), and MFA recovery codes stored
                encrypted at rest.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Usage data</span> — login
                timestamps, IP addresses, device fingerprints, and session metadata used for anomaly
                detection.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Technical data</span> — browser
                user-agent, operating system, and screen resolution collected automatically.
              </li>
            </ul>
          </section>

          {/* 2 — How We Use Data */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              2. How We Use Your Data
            </h2>
            <p className="mb-3">We use collected information for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Authenticating your identity and managing your sessions.</li>
              <li>Detecting and preventing fraudulent or unauthorized access.</li>
              <li>Sending transactional emails (OTP codes, password resets, security alerts).</li>
              <li>Improving the reliability and performance of our services.</li>
              <li>Complying with applicable legal obligations.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              We do not use your data for advertising or sell it to third parties.
            </p>
          </section>

          {/* 3 — Data Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              3. Data Sharing
            </h2>
            <p className="mb-3">
              {legal.companyName} is a self-hosted platform. When you run {legal.companyName} on
              your own infrastructure, all data remains on your servers and is never transmitted to
              the {legal.companyName} maintainers.
            </p>
            <p className="text-muted-foreground">
              If you use a managed {legal.companyName} cloud offering, we may share limited data
              with trusted sub-processors (e.g., cloud hosting providers, email delivery services)
              solely to operate the service. All sub-processors are contractually bound to protect
              your data under terms no less protective than this policy.
            </p>
          </section>

          {/* 4 — Security */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              4. Security
            </h2>
            <p className="mb-3">
              We implement industry-standard safeguards to protect your information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>All data in transit is encrypted with TLS 1.2 or higher.</li>
              <li>
                Sensitive fields (passwords, TOTP seeds) are encrypted at rest using AES-256-GCM.
              </li>
              <li>Access to production systems is protected by hardware MFA.</li>
              <li>Security patches are applied within 24 hours of a critical CVE disclosure.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              No method of transmission over the Internet is 100% secure. We encourage you to use
              strong, unique passwords and enable multi-factor authentication.
            </p>
          </section>

          {/* 5 — Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              5. Cookies &amp; Local Storage
            </h2>
            <p className="mb-3">{legal.companyName} uses the following types of browser storage:</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono text-primary">za_session</TableCell>
                    <TableCell>Authentication session token</TableCell>
                    <TableCell>Session</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-primary">za_cookie_consent</TableCell>
                    <TableCell>Stores your cookie consent choice</TableCell>
                    <TableCell>1 year</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-primary">za_csrf</TableCell>
                    <TableCell>CSRF protection token</TableCell>
                    <TableCell>Session</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          {/* 6 — GDPR */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              6. Your Rights (GDPR &amp; CCPA)
            </h2>
            <p className="mb-3">
              Depending on your location you may have the following rights regarding your personal
              data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                <span className="text-foreground/80 font-medium">Access</span> — request a copy of
                the data we hold about you.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Rectification</span> — correct
                inaccurate or incomplete data.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Erasure</span> — request deletion
                of your personal data (&ldquo;right to be forgotten&rdquo;).
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Portability</span> — receive your
                data in a machine-readable format.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Objection</span> — object to
                certain processing activities.
              </li>
              <li>
                <span className="text-foreground/80 font-medium">Withdraw consent</span> — revoke
                any consent you have given at any time.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              To exercise any of these rights, contact us at the address below. We will respond
              within 30 days.
            </p>
          </section>

          {/* 7 — Contact */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
              7. Contact
            </h2>
            <p className="text-muted-foreground">
              Questions about this policy or your data? Reach us at{" "}
              <a
                href={`mailto:${legal.privacyEmail}`}
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
              >
                {legal.privacyEmail}
              </a>
              {legal.companyAddress ? <>, or write to us at {legal.companyAddress}</> : null}.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
