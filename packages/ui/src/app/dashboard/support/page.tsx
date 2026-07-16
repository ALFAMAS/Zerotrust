"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ReplySupportTicketInput,
  replySupportTicketSchema,
  type SupportTicketInput,
  supportTicketSchema,
} from "@zerotrust/shared-types/support";
import { Ticket } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const createForm = useForm<SupportTicketInput>({
    resolver: zodResolver(supportTicketSchema),
    mode: "onBlur",
    defaultValues: { subject: "", message: "", priority: "normal" },
  });
  const replyForm = useForm<ReplySupportTicketInput>({
    resolver: zodResolver(replySupportTicketSchema),
    mode: "onBlur",
    defaultValues: { body: "" },
  });

  const threadQuery = useSupportThreadQuery(activeId);
  const tickets = ticketsQuery.data?.tickets ?? [];
  const thread = threadQuery.data ?? null;

  const createTicket = createForm.handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync(values);
      setCreateOpen(false);
      createForm.reset();
    } catch (e) {
      createForm.setError("root", { message: (e as Error).message });
    }
  });

  const sendReply = replyForm.handleSubmit(async (values) => {
    if (!activeId) return;
    try {
      await replyMutation.mutateAsync({ id: activeId, body: values.body });
      replyForm.reset();
    } catch (error) {
      replyForm.setError("root", {
        message: error instanceof Error ? error.message : "Failed to send reply",
      });
    }
  });

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
        <Modal
          title="New support ticket"
          onClose={() => {
            setCreateOpen(false);
            createForm.reset();
          }}
        >
          <form className="space-y-4" onSubmit={createTicket} noValidate>
            <div>
              <label htmlFor="support-subject" className="mb-2 block text-sm text-foreground/80">
                Subject
              </label>
              <Input
                id="support-subject"
                placeholder="Brief summary of the issue"
                className="bg-muted"
                aria-invalid={Boolean(createForm.formState.errors.subject)}
                aria-describedby={
                  createForm.formState.errors.subject ? "support-subject-error" : undefined
                }
                {...createForm.register("subject")}
              />
              {createForm.formState.errors.subject && (
                <p
                  id="support-subject-error"
                  className="mt-1 text-xs text-destructive"
                  aria-live="polite"
                >
                  {createForm.formState.errors.subject.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="support-message" className="mb-2 block text-sm text-foreground/80">
                Message
              </label>
              <Textarea
                id="support-message"
                rows={5}
                placeholder="Describe what's happening, and any steps to reproduce."
                className="bg-muted"
                aria-invalid={Boolean(createForm.formState.errors.message)}
                aria-describedby={
                  createForm.formState.errors.message ? "support-message-error" : undefined
                }
                {...createForm.register("message")}
              />
              {createForm.formState.errors.message && (
                <p
                  id="support-message-error"
                  className="mt-1 text-xs text-destructive"
                  aria-live="polite"
                >
                  {createForm.formState.errors.message.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="support-priority" className="mb-2 block text-sm text-foreground/80">
                Priority
              </label>
              <Controller
                name="priority"
                control={createForm.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="support-priority" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {createForm.formState.errors.root && (
              <p className="text-sm text-danger-subtle-foreground" aria-live="polite">
                {createForm.formState.errors.root.message}
              </p>
            )}
            <Button
              type="submit"
              disabled={createMutation.isPending || createForm.formState.isSubmitting}
              className="w-full"
            >
              {createMutation.isPending ? "Submitting…" : "Submit ticket"}
            </Button>
          </form>
        </Modal>
      )}

      {/* Thread modal */}
      {activeId && (
        <Modal
          title={thread?.ticket.subject ?? "Ticket"}
          onClose={() => {
            setActiveId(null);
            replyForm.reset();
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
                <form className="space-y-2" onSubmit={sendReply} noValidate>
                  <label htmlFor="support-reply" className="sr-only">
                    Reply
                  </label>
                  <Textarea
                    id="support-reply"
                    rows={3}
                    placeholder="Write a reply…"
                    className="bg-muted"
                    aria-invalid={Boolean(replyForm.formState.errors.body)}
                    aria-describedby={
                      replyForm.formState.errors.body ? "support-reply-error" : undefined
                    }
                    {...replyForm.register("body")}
                  />
                  {replyForm.formState.errors.body && (
                    <p
                      id="support-reply-error"
                      className="text-xs text-destructive"
                      aria-live="polite"
                    >
                      {replyForm.formState.errors.body.message}
                    </p>
                  )}
                  {replyForm.formState.errors.root && (
                    <p className="text-xs text-destructive" aria-live="polite">
                      {replyForm.formState.errors.root.message}
                    </p>
                  )}
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
                      type="submit"
                      disabled={replyMutation.isPending || replyForm.formState.isSubmitting}
                    >
                      {replyMutation.isPending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
