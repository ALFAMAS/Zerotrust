import Link from "next/link";
import { brand } from "@/config/brand";

const features = [
  {
    icon: "🔐",
    title: "PASETO Tokens",
    desc: "Platform-Agnostic Security Tokens with AES-256-GCM encryption. No JWT footguns.",
  },
  {
    icon: "🔑",
    title: "WebAuthn Passkeys",
    desc: "Phishing-resistant hardware key and biometric authentication. FIDO2 compliant.",
  },
  {
    icon: "📱",
    title: "Multi-Factor Auth",
    desc: "TOTP, Email OTP, SMS, WhatsApp, and Telegram channels out of the box.",
  },
  {
    icon: "🛡️",
    title: "Zero-Trust Sessions",
    desc: "Continuous access evaluation, device binding, and anomaly detection on every request.",
  },
  {
    icon: "🏗️",
    title: "RBAC + ABAC",
    desc: "Role hierarchy with attribute-based conditions, JIT privilege escalation, and geo-fencing.",
  },
  {
    icon: "🔗",
    title: "Magic Links",
    desc: "Passwordless email login with secure single-use tokens. No password required.",
  },
  {
    icon: "🌐",
    title: "OIDC Provider",
    desc: `Expose ${brand.name} as a standards-compliant OpenID Connect identity provider.`,
  },
  {
    icon: "🏢",
    title: "SAML 2.0",
    desc: "SP-initiated SSO for enterprise IdP integrations with Azure AD, Okta, and more.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="font-bold text-white text-lg">{brand.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <a href={`${brand.apiUrl}/docs`} className="text-gray-400 hover:text-white text-sm transition-colors">Docs</a>
          <Link href="/login" className="text-gray-400 hover:text-white text-sm transition-colors">Sign In</Link>
          <Link href="/register" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          {brand.announcementBadge}
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          {brand.heroTitle}<br />
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {brand.heroSubtitle}
          </span>
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          {brand.heroDescription}
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/register" className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-lg">
            Start Free →
          </Link>
          <a href={`${brand.apiUrl}/docs`} className="px-8 py-3.5 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold rounded-xl transition-colors text-lg">
            View API Docs
          </a>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-3">Everything you need to ship secure auth</h2>
        <p className="text-gray-400 text-center mb-12">No third-party dependency on your critical auth path.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-800 transition-colors">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Get running in minutes</h2>
        <div className="space-y-6">
          {[
            { step: "1", title: "Clone & configure", code: "cp .env.example .env  # add your secrets" },
            { step: "2", title: "Start the stack", code: "docker compose up -d" },
            { step: "3", title: "Open the app", code: `open ${brand.url}` },
          ].map((s) => (
            <div key={s.step} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">
                {s.step}
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">{s.title}</h3>
                <code className="block bg-gray-900 border border-gray-800 text-indigo-300 px-4 py-2.5 rounded-lg text-sm font-mono">
                  {s.code}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 border border-indigo-700 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-indigo-200 mb-8">Self-hosted. Open source. No vendor lock-in.</p>
          <Link href="/register" className="px-8 py-3.5 bg-white text-indigo-700 hover:bg-gray-100 font-semibold rounded-xl transition-colors inline-block">
            Create your account →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
        <div className="text-gray-500 text-sm">© {brand.copyrightYear} {brand.name}. Open source under {brand.license}.</div>
        <div className="flex gap-6 text-sm text-gray-500">
          <a href={brand.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          <a href={`${brand.apiUrl}/docs`} className="hover:text-white transition-colors">Docs</a>
          <Link href="/security" className="hover:text-white transition-colors">Security</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
