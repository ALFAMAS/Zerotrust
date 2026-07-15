"use client";

import { Ticket } from "lucide-react";
import { useState } from "react";
import Modal from "@/components/Modal";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateSupportTicketMutation,
  useReplySupportTicketMutation,
  useSupportThreadQuery,
  useSupportTicketsQuery,
  useUpdateTicketStatusMutation,
} from "@/lib/server-state/support";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-success/40 text-success-subtle-foreground",
  pending: "bg-warning/40 text-warning-subtle-foreground",
  closed: "bg-muted text-muted-foreground",
};

export default function SupportPage() {
  const ticketsQuery = useSupportTicketsQuery();
  const createMutation = useCreateSupportTicketMutation();
  const replyMutation = useReplySupportTicketMutation();
  const statusMutation = useUpdateTicketStatusMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", priority: "normal" });
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const threadQuery = useSupportThreadQuery(activeId);
  const tickets = ticketsQuery.data?.tickets ?? [];
  const thread = threadQuery.data ?? null;

  async function createTicket() {
    if (!form.subject.trim() || !form.message.trim()) {
      setError("Subject and message are required");
      return;
    }
    setError(null);
    try {
      await createMutation.mutateAsync({
        subject: form.subject.trim(),
        message: form.message.trim(),
        priority: form.priority as "low" | "normal" | "high",
      });
      setCreateOpen(false);
      setForm({ subject: "", message: "", priority: "normal" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    try {
      await replyMutation.mutateAsync({ id: activeId, body: reply.trim() });
      setReply("");
    } catch {
      /* surfaced by refetch */
    }
  }

  async function closeTicket() {
    if (!activeId) return;
    try {
      await statusMutation.mutateAsync({ id: activeId, status: "closed" });
    } catch {
      /* surfaced by refetch */
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <PageHeader
            title={<>Support</>}
            description={
              <>
                Open a ticket and our team will reply here. You&apos;ll also be notified by email.
              </>
            }
          />
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
          New ticket
        </Button>
      </div>

      <ServerStateStatus
        isFetching={ticketsQuery.isFetching && !ticketsQuery.isPending}
        isStale={ticketsQuery.isStale}
        hasData={tickets.length > 0}
        label="tickets"
        onRefresh={() => void ticketsQuery.refetch()}
      />

      {ticketsQuery.error && tickets.length === 0 ? (
        <ErrorState
          message={ticketsQuery.error.message}
          retry={() => void ticketsQuery.refetch()}
        />
      ) : ticketsQuery.isPending ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-card motion-reduce:animate-none"
            />
          ))}
          <p className="sr-only">Loading support tickets…</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Ticket}
            title="No support tickets yet"
            description="Have a question or hit a snag? Open a ticket and we'll help you out."
            action={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                Open your first ticket
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <Button
                type="button"
                onClick={() => setActiveId(t.id)}
                variant="outline"
                className="h-auto w-full justify-between gap-4 rounded-xl border-border bg-card p-4 text-left hover:border-primary/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {new Date(t.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.priority === "high" && (
                    <span className="rounded bg-destructive/40 px-2 py-1 text-xs font-semibold uppercase text-danger-subtle-foreground">
                      High
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                  >
                    {t.status}
                  </span>
                </div>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Create ticket modal */}
      {createOpen && (
        <Modal title="New support ticket" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="page-f0" className="mb-2 block text-sm text-foreground/80">
                Subject
              </label>
              <Input
                id="page-f0"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief summary of the issue"
                className="bg-muted"
              />
            </div>
            <div>
              <label htmlFor="page-f1" className="mb-2 block text-sm text-foreground/80">
                Message
              </label>
              <Textarea
                id="page-f1"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={5}
                placeholder="Describe what's happening, and any steps to reproduce."
                className="bg-muted"
              />
            </div>
            <div>
              <span className="mb-2 block text-sm text-foreground/80">Priority</span>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-danger-subtle-foreground">{error}</p>}
            <Button
              type="button"
              onClick={createTicket}
              disabled={!form.subject.trim() || !form.message.trim() || createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? "Submitting…" : "Submit ticket"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Thread modal */}
      {activeId && (
        <Modal
          title={thread?.ticket.subject ?? "Ticket"}
          onClose={() => {
            setActiveId(null);
            setReply("");
          }}
        >
          {threadQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : threadQuery.error ? (
            <ErrorState
              message={threadQuery.error.message}
              retry={() => void threadQuery.refetch()}
            />
          ) : !thread ? null : (
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
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder="Write a reply…"
                    className="bg-muted"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      onClick={closeTicket}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      disabled={statusMutation.isPending}
                    >
                      Close ticket
                    </Button>
                    <Button
                      type="button"
                      onClick={sendReply}
                      disabled={!reply.trim() || replyMutation.isPending}
                    >
                      {replyMutation.isPending ? "Sending…" : "Send reply"}
                    </Button>
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
