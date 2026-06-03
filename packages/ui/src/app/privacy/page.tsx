import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ZeroAuth",
  description: "Learn how ZeroAuth collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            Z
          </div>
          <span className="font-bold text-white text-lg group-hover:text-indigo-300 transition-colors">
            ZeroAuth
          </span>
        </Link>
        <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Back to Home
        </Link>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-12">Last updated: June 3, 2026</p>

        <div className="space-y-12 text-gray-300 leading-relaxed">

          {/* 1 — Data Collection */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              1. Data We Collect
            </h2>
            <p className="mb-3">
              When you use ZeroAuth we may collect the following categories of information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>
                <span className="text-gray-300 font-medium">Account information</span> — email address, display name, and hashed passwords when you register.
              </li>
              <li>
                <span className="text-gray-300 font-medium">Authentication data</span> — TOTP seeds, WebAuthn credential IDs (public keys only), and MFA recovery codes stored encrypted at rest.
              </li>
              <li>
                <span className="text-gray-300 font-medium">Usage data</span> — login timestamps, IP addresses, device fingerprints, and session metadata used for anomaly detection.
              </li>
              <li>
                <span className="text-gray-300 font-medium">Technical data</span> — browser user-agent, operating system, and screen resolution collected automatically.
              </li>
            </ul>
          </section>

          {/* 2 — How We Use Data */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              2. How We Use Your Data
            </h2>
            <p className="mb-3">We use collected information for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Authenticating your identity and managing your sessions.</li>
              <li>Detecting and preventing fraudulent or unauthorized access.</li>
              <li>Sending transactional emails (OTP codes, password resets, security alerts).</li>
              <li>Improving the reliability and performance of our services.</li>
              <li>Complying with applicable legal obligations.</li>
            </ul>
            <p className="mt-3 text-gray-400">
              We do not use your data for advertising or sell it to third parties.
            </p>
          </section>

          {/* 3 — Data Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              3. Data Sharing
            </h2>
            <p className="mb-3">
              ZeroAuth is a self-hosted platform. When you run ZeroAuth on your own infrastructure, all
              data remains on your servers and is never transmitted to Anthropic or the ZeroAuth
              maintainers.
            </p>
            <p className="text-gray-400">
              If you use a managed ZeroAuth cloud offering, we may share limited data with trusted
              sub-processors (e.g., cloud hosting providers, email delivery services) solely to operate
              the service. All sub-processors are contractually bound to protect your data under terms
              no less protective than this policy.
            </p>
          </section>

          {/* 4 — Security */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              4. Security
            </h2>
            <p className="mb-3">
              We implement industry-standard safeguards to protect your information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>All data in transit is encrypted with TLS 1.2 or higher.</li>
              <li>Sensitive fields (passwords, TOTP seeds) are encrypted at rest using AES-256-GCM.</li>
              <li>Access to production systems is protected by hardware MFA.</li>
              <li>Security patches are applied within 24 hours of a critical CVE disclosure.</li>
            </ul>
            <p className="mt-3 text-gray-400">
              No method of transmission over the Internet is 100% secure. We encourage you to use
              strong, unique passwords and enable multi-factor authentication.
            </p>
          </section>

          {/* 5 — Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              5. Cookies &amp; Local Storage
            </h2>
            <p className="mb-3">ZeroAuth uses the following types of browser storage:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-400 border border-gray-800 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-900 text-gray-300">
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Purpose</th>
                    <th className="px-4 py-3 text-left font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr>
                    <td className="px-4 py-3 font-mono text-indigo-400">za_session</td>
                    <td className="px-4 py-3">Authentication session token</td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-indigo-400">za_cookie_consent</td>
                    <td className="px-4 py-3">Stores your cookie consent choice</td>
                    <td className="px-4 py-3">1 year</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-indigo-400">za_csrf</td>
                    <td className="px-4 py-3">CSRF protection token</td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6 — GDPR */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              6. Your Rights (GDPR &amp; CCPA)
            </h2>
            <p className="mb-3">
              Depending on your location you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li><span className="text-gray-300 font-medium">Access</span> — request a copy of the data we hold about you.</li>
              <li><span className="text-gray-300 font-medium">Rectification</span> — correct inaccurate or incomplete data.</li>
              <li><span className="text-gray-300 font-medium">Erasure</span> — request deletion of your personal data ("right to be forgotten").</li>
              <li><span className="text-gray-300 font-medium">Portability</span> — receive your data in a machine-readable format.</li>
              <li><span className="text-gray-300 font-medium">Objection</span> — object to certain processing activities.</li>
              <li><span className="text-gray-300 font-medium">Withdraw consent</span> — revoke any consent you have given at any time.</li>
            </ul>
            <p className="mt-3 text-gray-400">
              To exercise any of these rights, contact us at the address below. We will respond within
              30 days.
            </p>
          </section>

          {/* 7 — Contact */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-gray-800">
              7. Contact
            </h2>
            <p className="text-gray-400">
              Questions about this policy or your data? Reach us at{" "}
              <a
                href="mailto:privacy@zeroauth.dev"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
              >
                privacy@zeroauth.dev
              </a>
              .
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
        <div className="text-gray-500 text-sm">© 2026 ZeroAuth. Open source under MIT.</div>
        <div className="flex gap-6 text-sm text-gray-500">
          <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
