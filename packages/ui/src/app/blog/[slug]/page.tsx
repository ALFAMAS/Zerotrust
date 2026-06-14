import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPost, blogPosts } from "@/data/blog-posts";
import { brand } from "@/config/brand";

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getBlogPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — ${brand.name}`,
    description: post.excerpt,
  };
}

function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-2xl font-bold text-foreground mt-8 mb-4">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-3xl font-bold text-foreground mt-8 mb-4">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("- ")) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`list-${i}`} className="list-disc list-inside space-y-1 text-foreground/80 mb-4">
          {listItems.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<br key={i} />);
    } else {
      elements.push(
        <p key={i} className="text-foreground/80 leading-relaxed mb-4">
          {line}
        </p>
      );
    }
    i++;
  }
  return elements;
}

export default function BlogPostPage({ params }: Props) {
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/blog" className="text-sm text-primary hover:text-primary/80 mb-8 block">
        ← Back to Blog
      </Link>

      <article>
        <div className="flex items-center gap-3 mb-4">
          <time className="text-sm text-muted-foreground">
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

        <h1 className="text-4xl font-bold text-foreground mb-4">{post.title}</h1>
        <p className="text-lg text-muted-foreground mb-10 leading-relaxed">{post.excerpt}</p>

        <div className="prose-custom">{renderContent(post.content)}</div>
      </article>
    </div>
  );
}
