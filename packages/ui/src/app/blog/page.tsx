import Link from "next/link";
import type { Metadata } from "next";
import { blogPosts } from "@/data/blog-posts";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Blog — ${process.env.NEXT_PUBLIC_APP_NAME ?? "ZeroAuth"}`,
  description: "News, deep dives, and guides from the ZeroAuth team.",
};

export default function BlogPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="mb-12">
        <Link href="/" className="text-sm text-primary hover:text-primary/80 mb-6 block">
          ← {brand.name}
        </Link>
        <h1 className="text-4xl font-bold text-foreground mb-3">Blog</h1>
        <p className="text-muted-foreground">News, deep dives, and guides from the {brand.name} team.</p>
      </div>

      <div className="space-y-8">
        {blogPosts.map((post) => (
          <article
            key={post.slug}
            className="bg-card border border-border rounded-xl p-6 hover:border-border transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <time className="text-xs text-muted-foreground">
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-primary border border-indigo-900"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              <Link href={`/blog/${post.slug}`} className="hover:text-primary/80 transition-colors">
                {post.title}
              </Link>
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">{post.excerpt}</p>
            <Link
              href={`/blog/${post.slug}`}
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
