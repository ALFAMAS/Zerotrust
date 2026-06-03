import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { legal } from "@/config/legal";

export const metadata: Metadata = {
  title: `Terms of Service — ${brand.name}`,
  description: `Read the terms and conditions governing your use of ${brand.name}.`,
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="font-bold text-white text-lg group-hover:text-indigo-300 transition-colors">
            {brand.name}
          </span>
        </Link>
        <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Back to Home
        </Link>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-3">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-12">Last updated: {legal.termsEffectiveDate}</p>

        <div className="space-y-12 text-gray-300 leading-relaxed">

          {/* 1 — Acceptance */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              1. Acceptance of Terms
            </h2>
            <p className="mb-3">
              By accessing or using {legal.companyName} (the &ldquo;Service&rdquo;) — whether through our hosted
              offering or a self-hosted deployment — you agree to be bound by these Terms of Service
              (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service.
            </p>
            <p className="text-gray-400">
              We may update these Terms from time to time. Continued use of the Service after changes
              are posted constitutes your acceptance of the revised Terms. The &ldquo;Last updated&rdquo; date
              above reflects the most recent revision.
            </p>
          </section>

          {/* 2 — Service Description */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              2. Service Description
            </h2>
            <p className="mb-3">
              {legal.companyName} is an open-source, self-hosted authentication platform that provides:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>PASETO-based session management and token issuance.</li>
              <li>WebAuthn / FIDO2 passkey enrollment and verification.</li>
              <li>Multi-factor authentication (TOTP, Email OTP, SMS, WebAuthn).</li>
              <li>Role-based and attribute-based access control (RBAC / ABAC).</li>
              <li>OIDC Provider and SAML 2.0 service-provider integrations.</li>
            </ul>
            <p className="mt-3 text-gray-400">
              The Service is provided &ldquo;as is&rdquo; and may be updated, modified, or discontinued at any
              time. We are not liable for any downtime or feature removal.
            </p>
          </section>

          {/* 3 — User Accounts */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              3. User Accounts
            </h2>
            <p className="mb-3">To use certain features you must create an account. You agree to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Provide accurate, current, and complete registration information.</li>
              <li>Keep your credentials confidential and not share them with third parties.</li>
              <li>Notify us immediately at{" "}
                <a
                  href={`mailto:${legal.supportEmail}`}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
                >
                  {legal.supportEmail}
                </a>
                {" "}if you suspect unauthorized use of your account.
              </li>
              <li>Be responsible for all activity that occurs under your account.</li>
            </ul>
          </section>

          {/* 4 — Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              4. Acceptable Use
            </h2>
            <p className="mb-3">You may not use the Service to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Violate any applicable law or regulation.</li>
              <li>Conduct unauthorized penetration testing or vulnerability scanning of third-party systems.</li>
              <li>Distribute malware, spyware, or any malicious code.</li>
              <li>Attempt to reverse-engineer, decompile, or tamper with the platform&apos;s security mechanisms.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Send unsolicited commercial communications (spam).</li>
            </ul>
            <p className="mt-3 text-gray-400">
              Violation of these policies may result in immediate account termination and, where
              applicable, reporting to law enforcement.
            </p>
          </section>

          {/* 5 — Termination */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              5. Termination
            </h2>
            <p className="mb-3">
              Either party may terminate this agreement at any time. You may delete your account
              through the account settings page. We reserve the right to suspend or terminate your
              access without notice if we reasonably believe you have violated these Terms.
            </p>
            <p className="text-gray-400">
              Upon termination, your right to use the Service ceases immediately. Provisions that by
              their nature should survive termination (including Limitation of Liability and Governing
              Law) shall do so.
            </p>
          </section>

          {/* 6 — Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              6. Limitation of Liability
            </h2>
            <p className="mb-3 text-gray-400 uppercase text-xs tracking-wide font-medium">
              To the maximum extent permitted by law:
            </p>
            <p className="mb-3">
              The Service is provided <strong className="text-white">&ldquo;AS IS&rdquo;</strong> and{" "}
              <strong className="text-white">&ldquo;AS AVAILABLE&rdquo;</strong> without warranties of any kind,
              either express or implied, including but not limited to warranties of merchantability,
              fitness for a particular purpose, or non-infringement.
            </p>
            <p className="text-gray-400">
              In no event shall the {legal.companyLegalName} contributors or maintainers be liable for any indirect,
              incidental, special, consequential, or punitive damages — including loss of profits, data,
              goodwill, or business interruption — arising out of or relating to your use of or
              inability to use the Service, even if advised of the possibility of such damages.
            </p>
          </section>

          {/* 7 — Governing Law */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              7. Governing Law
            </h2>
            <p className="text-gray-400">
              These Terms are governed by and construed in accordance with {legal.jurisdiction},
              without regard to conflict-of-law principles. Any disputes arising under these Terms
              shall be subject to the exclusive jurisdiction of the courts in that jurisdiction.
            </p>
          </section>

          {/* 8 — Contact */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              8. Contact
            </h2>
            <p className="text-gray-400">
              Questions about these Terms? Email us at{" "}
              <a
                href={`mailto:${legal.supportEmail}`}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
              >
                {legal.supportEmail}
              </a>
              {legal.companyAddress ? (
                <>, or write to {legal.companyLegalName}, {legal.companyAddress}</>
              ) : null}
              .
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
        <div className="text-gray-500 text-sm">© {brand.copyrightYear} {brand.name}. Open source under {brand.license}.</div>
        <div className="flex gap-6 text-sm text-gray-500">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
