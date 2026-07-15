import { Lock } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";

const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground hover:no-underline motion-reduce:transition-none";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
                {brand.logoLetter}
              </span>
              <span className="font-display text-base font-semibold text-foreground">
                {brand.name}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Self-hosted and open source under the {brand.license} license.
            </p>
          </div>

          <nav
            aria-label="Footer navigation"
            className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3"
          >
            <div>
              <h2 className="text-sm font-semibold text-foreground">Product</h2>
              <ul className="mt-2">
                <li>
                  <Link href="/#features" className={footerLinkClass}>
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className={footerLinkClass}>
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/status" className={footerLinkClass}>
                    Status
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Resources</h2>
              <ul className="mt-2">
                <li>
                  <a href={`${brand.apiUrl}/docs`} className={footerLinkClass}>
                    Documentation
                  </a>
                </li>
                <li>
                  <Link href="/help" className={footerLinkClass}>
                    Help center
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Legal</h2>
              <ul className="mt-2">
                <li>
                  <Link href="/privacy" className={footerLinkClass}>
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className={footerLinkClass}>
                    Terms
                  </Link>
                </li>
                <li>
                  <a
                    href={brand.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLinkClass}
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          © {brand.copyrightYear} {brand.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
