"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const navLinkClass =
  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";

function BrandLink() {
  return (
    <Link href="/" aria-label={`${brand.name} home`} className="flex items-center gap-3 rounded-lg">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
        {brand.logoLetter}
      </span>
      <span className="font-display text-base font-semibold text-foreground">{brand.name}</span>
    </Link>
  );
}

function PublicLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <>
      <Link href="/#features" className={navLinkClass}>
        Features
      </Link>
      <a href={`${brand.apiUrl}/docs`} className={navLinkClass}>
        Docs
      </a>
      <Link href="/security" className={navLinkClass}>
        Security
      </Link>
      <Link href="/login" className={navLinkClass}>
        Sign in
      </Link>
      <Link
        href="/register"
        className={cn(buttonVariants({ size: mobile ? "default" : "sm" }), mobile && "mt-2")}
      >
        Get started
      </Link>
    </>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <BrandLink />

        <nav aria-label="Primary navigation" className="ms-auto hidden items-center gap-1 md:flex">
          <PublicLinks />
        </nav>

        <div className="ms-auto flex items-center gap-1 md:ms-2">
          <ThemeToggle />
          <DialogPrimitive.Root>
            <DialogPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                className="md:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay md:hidden" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed inset-y-0 end-0 z-50 flex w-[min(20rem,calc(100%-2rem))] flex-col border-s border-border bg-surface p-4 shadow-lg outline-none md:hidden"
              >
                <div className="flex h-11 items-center justify-between">
                  <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                    Mobile navigation
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="Close navigation">
                      <X className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </DialogPrimitive.Close>
                </div>
                <nav
                  aria-label="Mobile navigation links"
                  className="mt-6 flex flex-col items-stretch gap-1"
                >
                  <PublicLinks mobile />
                </nav>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  );
}
