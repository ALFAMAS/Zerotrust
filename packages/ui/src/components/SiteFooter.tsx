import { Lock } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";

/** Shared marketing/public-page footer: brand blurb + Product / Resources / Legal columns. */
export default function SiteFooter() {
  return (
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
                  <Link
                    href="/#features"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Changelog
                  </Link>
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
                    href="/blog"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Blog
                  </Link>
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
  );
}
