import Link from "next/link";
import type { Metadata } from "next";
import { changelog } from "@/data/changelog";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Changelog — ${process.env.NEXT_PUBLIC_APP_NAME ?? "ZeroAuth"}`,
  description: "What's new in each release.",
};

const TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  added: { label: "Added", classes: "bg-emerald-950 text-emerald-400 border-emerald-900" },
  changed: { label: "Changed", classes: "bg-blue-950 text-blue-400 border-blue-900" },
  fixed: { label: "Fixed", classes: "bg-amber-950 text-amber-400 border-amber-900" },
  security: { label: "Security", classes: "bg-red-950 text-red-400 border-red-900" },
  removed: { label: "Removed", classes: "bg-gray-800 text-gray-400 border-gray-700" },
};

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="mb-12">
        <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300 mb-6 block">
          ← {brand.name}
        </Link>
        <h1 className="text-4xl font-bold text-white mb-3">Changelog</h1>
        <p className="text-gray-400">All notable changes to {brand.name}, newest first.</p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-800" />

        <div className="space-y-12">
          {changelog.map((entry) => (
            <div key={entry.version} className="relative pl-12">
              {/* Timeline dot */}
              <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-indigo-500 bg-gray-950" />

              <div className="flex items-baseline gap-4 mb-4">
                <h2 className="text-xl font-bold text-white">v{entry.version}</h2>
                <time className="text-sm text-gray-500">
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
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 ${style.classes}`}
                      >
                        {style.label}
                      </span>
                      <ul className="space-y-1">
                        {section.items.map((item, ii) => (
                          <li key={ii} className="flex items-start gap-2 text-sm text-gray-300">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
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
    </div>
  );
}
