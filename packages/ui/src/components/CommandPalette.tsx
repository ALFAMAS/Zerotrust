"use client";

import { ArrowRight, File, Search, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "page" | "user" | "setting" | "note";
  title: string;
  description?: string;
  href: string;
  icon?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard: () => <ArrowRight className="h-4 w-4" />,
  User: User,
  ShieldCheck: () => <ArrowRight className="h-4 w-4" />,
  Monitor: () => <ArrowRight className="h-4 w-4" />,
  Bell: () => <ArrowRight className="h-4 w-4" />,
  Building2: () => <ArrowRight className="h-4 w-4" />,
  KeyRound: () => <ArrowRight className="h-4 w-4" />,
  Webhook: () => <ArrowRight className="h-4 w-4" />,
  CreditCard: () => <ArrowRight className="h-4 w-4" />,
  Award: () => <ArrowRight className="h-4 w-4" />,
  LifeBuoy: () => <ArrowRight className="h-4 w-4" />,
  UserCog: () => <ArrowRight className="h-4 w-4" />,
  file: File,
  settings: Settings,
};

function ResultIcon({ icon, type }: { icon?: string; type: string }) {
  if (icon && ICON_MAP[icon]) {
    const Comp = ICON_MAP[icon];
    return <Comp className="h-4 w-4" />;
  }
  if (type === "note") return <File className="h-4 w-4" />;
  if (type === "user") return <User className="h-4 w-4" />;
  return <ArrowRight className="h-4 w-4" />;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        if (!open) {
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<{ results: SearchResult[] }>(
          `/collab/search?q=${encodeURIComponent(query)}`
        );
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSelectedIndex(0);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || results.length === 0) return;
    function handleNav(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          navigateTo(results[selectedIndex]);
        }
      }
    }
    document.addEventListener("keydown", handleNav);
    return () => document.removeEventListener("keydown", handleNav);
  }, [open, results, selectedIndex]);

  const navigateTo = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      router.push(result.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close command palette"
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          setOpen(false);
          setQuery("");
        }}
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, notes, people..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Search"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {!loading && results.length > 0 && (
            <div role="listbox">
              {results.map((result, i) => (
                <button
                  type="button"
                  key={`${result.type}-${result.href}-${i}`}
                  role="option"
                  aria-selected={i === selectedIndex}
                  onClick={() => navigateTo(result)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    i === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      i === selectedIndex
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <ResultIcon icon={result.icon} type={result.type} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{result.title}</div>
                    {result.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {result.description}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {result.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.length < 2 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 text-[10px]">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 text-[10px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
