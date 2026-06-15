import Link from "next/link";
import { brand } from "@/config/brand";

const links = [
  { href: "/help", label: "Help" },
  { href: "/status", label: "Status" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/** Compact footer for the authenticated app shell (dashboard + admin). */
export default function AppFooter() {
  return (
    <footer className="border-t border-border px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <span>
          © {brand.copyrightYear} {brand.name}
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <a
            href={brand.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
