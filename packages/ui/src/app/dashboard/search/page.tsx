"use client";

import { Building2, FileText, LifeBuoy, Search as SearchIcon, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type HitType = "user" | "org" | "note" | "ticket";

interface SearchHit {
  id: string;
  type: HitType;
  title: string;
  highlight?: string;
  score: number;
}

interface SearchResults {
  total: number;
  hits: SearchHit[];
  provider: "elasticsearch" | "database";
}

const TYPE_META: Record<HitType, { label: string; icon: typeof User }> = {
  user: { label: "User", icon: User },
  org: { label: "Org", icon: Building2 },
  note: { label: "Note", icon: FileText },
  ticket: { label: "Ticket", icon: LifeBuoy },
};

const FILTERS: { value: "" | HitType; label: string }[] = [
  { value: "", label: "All" },
  { value: "user", label: "Users" },
  { value: "org", label: "Orgs" },
  { value: "note", label: "Notes" },
  { value: "ticket", label: "Tickets" },
];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | HitType>("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const query = q.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (query.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, limit: "25" });
        if (type) params.set("type", type);
        const res = await api.get<SearchResults>(`/search?${params.toString()}`);
        setResults(res);
      } catch {
        setResults({ total: 0, hits: [], provider: "database" });
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, type]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
        <SearchIcon className="h-6 w-6 text-primary" aria-hidden="true" /> Search
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Full-text search across users, organizations, notes, and support tickets.
      </p>

      <div className="relative mb-4">
        <SearchIcon
          className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="pl-9"
          aria-label="Search query"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setType(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              type === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {q.trim().length >= 2 && results && (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {searching ? "Searching…" : `${results.total} result${results.total === 1 ? "" : "s"}`}
          </span>
          <Badge variant="outline" className="font-normal">
            {results.provider === "elasticsearch" ? "Elasticsearch" : "Database"}
          </Badge>
        </div>
      )}

      {results && results.hits.length > 0 ? (
        <ul className="space-y-2">
          {results.hits.map((hit) => {
            const meta = TYPE_META[hit.type];
            const Icon = meta.icon;
            return (
              <li key={`${hit.type}-${hit.id}`}>
                <Card>
                  <CardContent className="flex items-start gap-3 p-4">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{hit.title}</span>
                        <Badge variant="secondary">{meta.label}</Badge>
                      </div>
                      {hit.highlight && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {renderHighlight(hit.highlight)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        q.trim().length >= 2 &&
        !searching && (
          <div className="py-12 text-center">
            <SearchIcon
              className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">No results for “{q.trim()}”.</p>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Render a server highlight string safely. Elasticsearch wraps matched terms in
 * `<em>…</em>`; we split on those, render the matches as real `<em>` elements,
 * and let React escape every other segment as text. No `dangerouslySetInnerHTML`,
 * so a malicious indexed document cannot inject HTML into the result list.
 */
function renderHighlight(raw: string): React.ReactNode[] {
  return raw.split(/(<em>.*?<\/em>)/g).map((part, i) => {
    const match = /^<em>([\s\S]*)<\/em>$/.exec(part);
    return match ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string, never reordered
      <em key={i} className="font-medium text-foreground not-italic">
        {match[1]}
      </em>
    ) : (
      part
    );
  });
}
