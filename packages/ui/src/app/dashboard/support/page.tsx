"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "../../../components/EmptyState";
import Modal from "../../../components/Modal";
import { api } from "../../../lib/api";

interface Ticket {
  id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  authorRole: "user" | "agent";
  body: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-900/40 text-emerald-400",
  pending: "bg-amber-900/40 text-amber-400",
  closed: "bg-muted text-muted-foreground",
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", priority: "normal" });
  const [error, setError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Message[] } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ tickets: Ticket[] }>("/support")
      .then((r) => setTickets(r.tickets))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createTicket() {
    if (!form.subject.trim() || !form.message.trim()) {
      setError("Subject and message are required");
      return;
    }
    setError(null);
    try {
      await api.post("/support", {
        subject: form.subject.trim(),
        message: form.message.trim(),
        priority: form.priority,
      });
      setCreateOpen(false);
      setForm({ subject: "", message: "", priority: "normal" });
      setLoading(true);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openThread(id: string) {
    setActiveId(id);
    setThread(null);
    try {
      const data = await api.get<{ ticket: Ticket; messages: Message[] }>(`/support/${id}`);
      setThread(data);
    } catch {
      setThread(null);
    }
  }

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/support/${activeId}/messages`, { body: reply.trim() });
      setReply("");
      await openThread(activeId);
      load();
    } catch {
      /* surfaced by refetch */
    } finally {
      setSending(false);
    }
  }

  async function closeTicket() {
    if (!activeId) return;
    await api.patch(`/support/${activeId}`, { status: "closed" }).catch(() => {});
    await openThread(activeId);
    load();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            Support
          </h1>
          <p className="text-sm text-muted-foreground">
            Open a ticket and our team will reply here. You&apos;ll also be notified by email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          New ticket
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon="🎫"
            title="No support tickets yet"
            description="Have a question or hit a snag? Open a ticket and we'll help you out."
            actionLabel="Open your first ticket"
            onAction={() => setCreateOpen(true)}
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openThread(t.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Updated {new Date(t.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.priority === "high" && (
                    <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                      High
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                  >
                    {t.status}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Create ticket modal */}
      {createOpen && (
        <Modal title="New support ticket" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="page-f0" className="mb-1.5 block text-sm text-foreground/80">
                Subject
              </label>
              <input
                id="page-f0"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief summary of the issue"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label htmlFor="page-f1" className="mb-1.5 block text-sm text-foreground/80">
                Message
              </label>
              <textarea
                id="page-f1"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={5}
                placeholder="Describe what's happening, and any steps to reproduce."
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label htmlFor="page-f2" className="mb-1.5 block text-sm text-foreground/80">
                Priority
              </label>
              <select
                id="page-f2"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              onClick={createTicket}
              disabled={!form.subject.trim() || !form.message.trim()}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Submit ticket
            </button>
          </div>
        </Modal>
      )}

      {/* Thread modal */}
      {activeId && (
        <Modal
          title={thread?.ticket.subject ?? "Ticket"}
          onClose={() => {
            setActiveId(null);
            setThread(null);
            setReply("");
          }}
        >
          {!thread ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 text-sm ${
                      m.authorRole === "agent"
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-foreground/90"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.authorRole === "agent" ? "Support" : "You"} ·{" "}
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              {thread.ticket.status === "closed" ? (
                <p className="text-sm text-muted-foreground">
                  This ticket is closed. Open a new ticket if you need more help.
                </p>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder="Write a reply…"
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={closeTicket}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Close ticket
                    </button>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
