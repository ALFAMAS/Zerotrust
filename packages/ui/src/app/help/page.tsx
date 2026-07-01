"use client";

import { LifeBuoy, Mail, Minus, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brand } from "@/config/brand";
import { FAQ_ITEMS } from "../../data/faq";

const CATEGORIES = Array.from(new Set(FAQ_ITEMS.map((i) => i.category)));

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = FAQ_ITEMS;
    if (activeCategory) items = items.filter((i) => i.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (i) =>
          i.question.toLowerCase().includes(q) ||
          i.answer.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [query, activeCategory]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <div className="mb-12 text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
            Help center
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">Find answers to common questions.</p>
          <div className="relative mt-8">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search FAQs…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {!query && (
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                activeCategory === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </Button>
            {CATEGORIES.map((cat) => (
              <Button
                type="button"
                key={cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </Button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;.</p>
            <Button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveCategory(null);
              }}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <Button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <span className="mr-3 text-xs font-medium text-primary">{item.category}</span>
                      <span className="text-sm font-medium text-foreground">{item.question}</span>
                    </div>
                    <span className="flex-shrink-0 text-muted-foreground">
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </Button>
                  {isOpen && (
                    <div className="px-6 pb-5">
                      <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-16 rounded-2xl border border-border bg-card/50 p-8 text-center">
          <LifeBuoy className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Still have questions?</p>
          <Link
            href={`mailto:${brand.supportEmail}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Mail className="h-4 w-4" />
            Contact support
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
