import Link from "next/link";
import { brand } from "@/config/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared marketing/public-page header. Sticky, blurred, brand + nav + auth CTAs. */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            {brand.name}
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#features"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Features
          </Link>
          <Link
            href="/changelog"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Changelog
          </Link>
          <a
            href={`${brand.apiUrl}/docs`}
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Docs
          </a>
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
