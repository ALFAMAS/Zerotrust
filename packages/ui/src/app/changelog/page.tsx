import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { brand } from "@/config/brand";
import { changelog } from "@/data/changelog";

export const metadata: Metadata = {
  title: `Changelog — ${process.env.NEXT_PUBLIC_APP_NAME ?? "zerotrust"}`,
  description: "What's new in each release.",
};

const TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  added: {
    label: "Added",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  changed: {
    label: "Changed",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  fixed: {
    label: "Fixed",
    classes: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  security: {
    label: "Security",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  removed: {
    label: "Removed",
    classes: "bg-muted text-muted-foreground border-border",
  },
};

export default function ChangelogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <header className="mb-12">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
            Changelog
          </h1>
          <p className="mt-3 text-muted-foreground">
            All notable changes to {brand.name}, newest first.
          </p>
        </header>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute bottom-1 left-4 top-1 w-px bg-border" />

          <div className="space-y-12">
            {changelog.map((entry) => (
              <div key={entry.version} className="relative pl-12">
                {/* Timeline dot */}
                <div className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />

                <div className="mb-4 flex items-baseline gap-4">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                    v{entry.version}
                  </h2>
                  <time className="text-sm text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>

                <div className="space-y-4">
                  {entry.sections.map((section, si) => {
                    const style = TYPE_STYLES[section.type] ?? TYPE_STYLES.changed;
                    return (
                      <div key={si}>
                        <span
                          className={`mb-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${style.classes}`}
                        >
                          {style.label}
                        </span>
                        <ul className="space-y-1">
                          {section.items.map((item, ii) => (
                            <li
                              key={ii}
                              className="flex items-start gap-2 text-sm text-foreground/80"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
