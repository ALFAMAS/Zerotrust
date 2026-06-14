import { brand } from "@/config/brand";
import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";

const highlights = [
  {
    icon: KeyRound,
    title: "PASETO sessions",
    desc: "Stateless, tamper-evident tokens — no shared secrets to leak.",
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
    <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand / atmosphere panel (desktop only) ──────────────────────── */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-background lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="bg-grid mask-fade pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute -left-32 top-24 h-[28rem] w-[28rem] rounded-full opacity-40 blur-[140px]"
          style={{ background: brand.color }}
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/30 blur-[120px]" aria-hidden />

        <div className="animate-fade-up relative flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-lg font-bold text-white shadow-lg"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            {brand.name}
          </span>
        </div>

        <div className="relative max-w-md">
          <h2
            className="animate-fade-up font-display text-4xl font-semibold leading-[1.1] tracking-tight text-foreground"
            style={{ animationDelay: "80ms" }}
          >
            {brand.heroTitle} <span className="text-primary">{brand.heroSubtitle}</span>
          </h2>
          <p
            className="animate-fade-up mt-4 text-sm leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            {brand.description}
          </p>

          <ul className="mt-10 space-y-5">
            {highlights.map((h, i) => (
              <li
                key={h.title}
                className="animate-fade-up flex gap-4"
                style={{ animationDelay: `${240 + i * 80}ms` }}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                  <h.icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{h.title}</p>
                  <p className="text-sm text-muted-foreground">{h.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="animate-fade-up relative flex items-center gap-2 text-xs text-muted-foreground"
          style={{ animationDelay: "520ms" }}
        >
          <Lock className="h-3.5 w-3.5" />
          Self-hosted · {brand.license} licensed · © {brand.copyrightYear} {brand.name}
        </p>
      </aside>

      {/* ── Form panel ───────────────────────────────────────────────────── */}
      <main
        id="main-content"
        className="relative flex items-center justify-center px-5 py-10 sm:px-8"
      >
        <div className="bg-grid mask-fade pointer-events-none absolute inset-0 opacity-40 lg:hidden" aria-hidden />
        <div className="animate-fade-up relative w-full max-w-md">
          {/* Mobile logo (brand panel is hidden below lg) */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl font-display font-bold text-white"
              style={{ backgroundColor: brand.logoColor }}
            >
              {brand.logoLetter}
            </div>
            <span className="font-display text-xl font-semibold text-foreground">{brand.name}</span>
          </div>

          <div className="rounded-2xl border border-border bg-card/70 p-7 text-card-foreground shadow-2xl backdrop-blur-sm sm:p-8">
            {children}
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary/80" />
            Protected by {brand.name} · zero-trust by default
          </p>
        </div>
      </main>
    </div>
  );
}
