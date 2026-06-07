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
        <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300 mb-6 block">
          ← {brand.name}
        </Link>
        <h1 className="text-4xl font-bold text-white mb-3">Blog</h1>
        <p className="text-gray-400">News, deep dives, and guides from the {brand.name} team.</p>
      </div>

      <div className="space-y-8">
        {blogPosts.map((post) => (
          <article
            key={post.slug}
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <time className="text-xs text-gray-500">
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-900"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              <Link href={`/blog/${post.slug}`} className="hover:text-indigo-300 transition-colors">
                {post.title}
              </Link>
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{post.excerpt}</p>
            <Link
              href={`/blog/${post.slug}`}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
