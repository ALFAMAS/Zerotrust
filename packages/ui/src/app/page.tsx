import Link from "next/link";

const avatarColors = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-blue-500",
  "bg-teal-500",
];

const features = [
  {
    icon: "🔐",
    title: "Enterprise Auth",
    desc: "Register, login, MFA, and passkeys out of the box. Production-ready from day one.",
  },
  {
    icon: "🚀",
    title: "Deploy in minutes",
    desc: "Docker Compose included. One command to spin up your entire stack locally or in the cloud.",
  },
  {
    icon: "🎨",
    title: "Fully customizable",
    desc: "All UI code is yours. Tweak colors, fonts, copy — no vendor lock-in, no black boxes.",
  },
  {
    icon: "👥",
    title: "User management",
    desc: "Admin dashboard included. View, suspend, and manage users without writing extra code.",
  },
  {
    icon: "🔑",
    title: "Magic links",
    desc: "Passwordless login via email. Reduce friction and delight users with one-click sign-in.",
  },
  {
    icon: "🛡️",
    title: "Zero-trust security",
    desc: "Rate limiting, geo-fencing, and audit logs built in. Sleep well knowing your app is secure.",
  },
];

const freeTier = [
  "Up to 1,000 users",
  "Email/password auth",
  "Magic links",
  "Community support",
];

const proTier = [
  "Unlimited users",
  "OAuth (Google, GitHub)",
  "MFA & Passkeys",
  "Audit logs",
  "Priority support",
  "Custom domains",
];

const enterpriseTier = [
  "Everything in Pro",
  "SSO / SAML",
  "Custom SLA",
  "Dedicated infrastructure",
  "Security review",
  "White-glove onboarding",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-bold text-white">
                Acme
              </Link>
              <div className="hidden md:flex items-center gap-6">
                <Link
                  href="#features"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Features
                </Link>
                <Link
                  href="#pricing"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="#"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Docs
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-all"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-32">
        {/* Background glow blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-700/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-xs text-indigo-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Now in public beta
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight mb-6">
            Ship your SaaS in{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              days, not months
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            A complete SaaS boilerplate with authentication, user management,
            billing hooks, and a beautiful UI — so you can focus on what makes
            your product unique.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
            >
              Start for free
            </Link>
            <Link
              href="#"
              className="w-full sm:w-auto border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-8 py-3.5 rounded-xl transition-all text-base"
            >
              View demo →
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-gray-800 bg-gray-900/40 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="flex -space-x-2">
            {avatarColors.map((color, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-full ${color} border-2 border-gray-900 flex items-center justify-center text-xs font-bold text-white`}
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <p className="text-gray-300 text-sm font-medium">
            Trusted by{" "}
            <span className="text-white font-bold">1,000+ developers</span>{" "}
            worldwide
          </p>
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className="w-4 h-4 text-yellow-400 fill-current"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.364-1.118L2.05 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.299-3.957z" />
              </svg>
            ))}
            <span className="text-gray-400 text-xs ml-1">5.0</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything you need to launch
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Stop wiring up auth from scratch. Get a production-ready stack in
              minutes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors group"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-white font-semibold text-lg mb-2">
                  {f.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-gray-400 text-lg">
              Start free. Scale as you grow. No surprises.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col">
              <div className="mb-6">
                <h3 className="text-white font-bold text-xl mb-1">Free</h3>
                <p className="text-gray-400 text-sm mb-4">For hobbyists & side projects</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">$0</span>
                  <span className="text-gray-500 text-sm mb-1">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {freeTier.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block text-center border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-6 py-3 rounded-xl transition-all text-sm font-medium"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-gray-900 border-2 border-indigo-500 rounded-2xl p-8 flex flex-col relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-white font-bold text-xl mb-1">Pro</h3>
                <p className="text-gray-400 text-sm mb-4">For growing startups</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">$29</span>
                  <span className="text-gray-500 text-sm mb-1">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {proTier.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block text-center bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl transition-colors text-sm font-medium"
              >
                Start Pro trial
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col">
              <div className="mb-6">
                <h3 className="text-white font-bold text-xl mb-1">Enterprise</h3>
                <p className="text-gray-400 text-sm mb-4">For large teams & compliance</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">Custom</span>
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {enterpriseTier.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="#"
                className="block text-center border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-6 py-3 rounded-xl transition-all text-sm font-medium"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-3xl p-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to ship?
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              Join thousands of developers who stopped reinventing the wheel.
            </p>
            <Link
              href="/register"
              className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-10 py-4 rounded-xl transition-colors text-base"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-xl font-bold text-white">Acme</div>
            <div className="flex items-center gap-6">
              <Link href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Privacy</Link>
              <Link href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Terms</Link>
              <Link href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Docs</Link>
              <Link href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">GitHub</Link>
            </div>
            <p className="text-sm text-gray-600">
              © {new Date().getFullYear()} Acme, Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
