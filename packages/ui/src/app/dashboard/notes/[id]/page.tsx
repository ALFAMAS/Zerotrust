"use client";

import { Archive, ArrowLeft, Clock, User } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SkeletonText } from "@/components/Skeleton";
import { api } from "@/lib/api";

interface Note {
  id: string;
  orgId: string;
  title: string;
  content: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface Revision {
  id: string;
  content: string;
  editedBy: string;
  createdAt: string;
  editorName?: string;
}

export default function NoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;
  const [note, setNote] = useState<Note | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch note
  const fetchNote = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const data = await api.get<{ note: Note; revisions: Revision[] }>(`/collab/notes/${noteId}`);
      setNote(data.note);
      setTitle(data.note.title);
      setContent(data.note.content);
      setRevisions(data.revisions || []);
    } catch {
      router.push("/dashboard/notes");
    } finally {
      setLoading(false);
    }
  }, [noteId, router]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  // Auto-save on content change (debounced 1s)
  useEffect(() => {
    if (!note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (title === note.title && content === note.content) return;
      setSaving(true);
      try {
        await api.put(`/collab/notes/${noteId}`, { title, content });
        setNote((prev) =>
          prev ? { ...prev, title, content, updatedAt: new Date().toISOString() } : prev
        );
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, content, note, noteId]);

  const handleArchive = async () => {
    if (!confirm("Archive this note?")) return;
    try {
      await api.delete(`/collab/notes/${noteId}`);
      router.push("/dashboard/notes");
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div>
        <SkeletonText className="mb-4 h-8 w-64" />
        <SkeletonText className="mb-2 h-4 w-full max-w-md" />
        <SkeletonText className="mb-2 h-4 w-full max-w-lg" />
        <SkeletonText className="h-4 w-full max-w-sm" />
      </div>
    );
  }

  if (!note) return null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/dashboard/notes")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to notes
        </button>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="text-xs text-muted-foreground">Saving…</span>
          ) : (
            <span className="text-xs text-muted-foreground">Auto-saved</span>
          )}
          <button
            type="button"
            onClick={handleArchive}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title…"
        className="mb-4 w-full bg-transparent font-display text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />

      {/* Content editor */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing… Use @username to mention team members"
        className="min-h-[400px] w-full resize-y rounded-xl border border-border bg-card p-6 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Revision history */}
      {revisions.length > 1 && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Revision history
          </h3>
          <div className="space-y-2">
            {revisions.slice(0, 5).map((rev) => (
              <div
                key={rev.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs"
              >
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {rev.editorName ?? "Unknown"} edited {new Date(rev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
