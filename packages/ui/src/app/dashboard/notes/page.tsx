"use client";

import { Archive, Clock, FileText, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";
import { api } from "@/lib/api";

interface Note {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);

  // Get org context from user's memberships
  useEffect(() => {
    api
      .get<{ orgs: Array<{ org: { id: string }; member: { id: string } }> }>("/orgs")
      .then((d) => {
        if (d.orgs && d.orgs.length > 0) {
          setOrgId(d.orgs[0].org.id);
        }
      })
      .catch(() => {});
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await api.get<{ notes: Note[] }>(`/collab/notes?orgId=${orgId}`);
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = async () => {
    if (!orgId) return;
    try {
      const data = await api.post<{ note: Note }>("/collab/notes", {
        orgId,
        title: "Untitled note",
        content: "",
      });
      router.push(`/dashboard/notes/${data.note.id}`);
    } catch {
      // ignore
    }
  };

  const filteredNotes = search
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-medium text-foreground">No organization selected</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join an organization to create and view shared notes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Shared Notes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Collaborative notes for your team</p>
        </div>
        <button
          onClick={createNote}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New note
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes..."
          className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-sm font-medium text-foreground">
            {search ? "No notes match your search" : "No notes yet"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? "Try a different search term" : "Create your first note to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => router.push(`/dashboard/notes/${note.id}`)}
              className="w-full rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {note.title || "Untitled"}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {note.content || "No content"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
              {note.creatorName && (
                <div className="mt-2 text-[11px] text-muted-foreground">by {note.creatorName}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
