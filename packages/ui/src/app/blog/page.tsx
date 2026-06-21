import { ArrowRight, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { brand } from "@/config/brand";
import { blogPosts } from "@/data/blog-posts";

export const metadata: Metadata = {
  title: `Blog — ${process.env.NEXT_PUBLIC_APP_NAME ?? "ZeroAuth"}`,
  description: "News, deep dives, and guides from the ZeroAuth team.",
};

export default function BlogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <header className="mb-12">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
            Blog
          </h1>
          <p className="mt-3 text-muted-foreground">
            News, deep dives, and guides from the {brand.name} team.
          </p>
        </header>

        <div className="space-y-5">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center gap-3">
                <time className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground">
                <Link
                  href={`/blog/${post.slug}`}
                  className="transition-colors group-hover:text-primary"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Read more
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
