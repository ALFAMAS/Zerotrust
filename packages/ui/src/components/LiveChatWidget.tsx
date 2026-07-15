"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { brand } from "@/config/brand";
import { getToken } from "@/lib/auth";
import { useAuthMeQuery } from "@/lib/server-state/auth";
import {
  useCreateSupportTicketMutation,
  useReplySupportTicketMutation,
} from "@/lib/server-state/support";

/**
 * Native live chat fallback — rendered when no third-party provider is configured.
 * Provides a simple in-app chat interface that creates support tickets.
 */
export default function LiveChatWidget() {
  const { chatProvider, chatId } = brand;

  // If a third-party provider is configured, let the existing widget handle it
  if (chatProvider !== "none" && chatId) {
    return <ThirdPartyChatWidget />;
  }

  // Native fallback
  return <NativeChatWidget />;
}

/** Third-party widget loader (existing behavior) */
function ThirdPartyChatWidget() {
  const { chatProvider, chatId } = brand;
  const hasToken = typeof window !== "undefined" && !!getToken();
  const { data: me, isError, isFetched } = useAuthMeQuery(hasToken);
  const identityReady = !hasToken || isFetched || isError;
  const identity = me ? { name: me.displayName, email: me.email } : {};

  useEffect(() => {
    if (chatProvider === "none" || !chatId || !identityReady) return;
    if (typeof document === "undefined") return;
    if (document.getElementById("zerotrust-livechat")) return;

    const w = window as any;

    if (chatProvider === "crisp") {
      w.$crisp = w.$crisp || [];
      w.CRISP_WEBSITE_ID = chatId;
      if (identity.email) w.$crisp.push(["set", "user:email", [identity.email]]);
      if (identity.name) w.$crisp.push(["set", "user:nickname", [identity.name]]);
      const s = document.createElement("script");
      s.id = "zerotrust-livechat";
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      document.head.appendChild(s);
    } else if (chatProvider === "intercom") {
      w.intercomSettings = {
        app_id: chatId,
        name: identity.name,
        email: identity.email,
      };
      const s = document.createElement("script");
      s.id = "zerotrust-livechat";
      s.async = true;
      s.src = `https://widget.intercom.io/widget/${chatId}`;
      s.onload = () => {
        try {
          w.Intercom?.("boot", w.intercomSettings);
        } catch {
          /* ignore */
        }
      };
      document.head.appendChild(s);
    } else if (chatProvider === "tawk") {
      const [propertyId, widgetId] = chatId.split("/");
      if (!propertyId || !widgetId) return;
      w.Tawk_API = w.Tawk_API || {};
      if (identity.name || identity.email) {
        w.Tawk_API.visitor = { name: identity.name, email: identity.email };
      }
      w.Tawk_LoadStart = new Date();
      const s = document.createElement("script");
      s.id = "zerotrust-livechat";
      s.async = true;
      s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.head.appendChild(s);
    }
  }, [identity.email, identity.name, identityReady]);

  return null;
}

/** Native chat widget — creates support tickets via the API */
function NativeChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "system"; text: string }>>([]);
  const [input, setInput] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const createTicket = useCreateSupportTicketMutation();
  const replyTicket = useReplySupportTicketMutation();
  const sending = createTicket.isPending || replyTicket.isPending;
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: data loader intentionally runs on mount / when the route key changes; it closes over stable state setters
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      if (!ticketId) {
        const res = await createTicket.mutateAsync({
          subject: text.slice(0, 80),
          message: text,
        });
        setTicketId(res.ticket.id);
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            text: "Thanks for reaching out! A support agent will respond shortly. Your ticket has been created.",
          },
        ]);
      } else {
        await replyTicket.mutateAsync({ id: ticketId, body: text });
        setMessages((prev) => [
          ...prev,
          { role: "system", text: "Message sent. An agent will respond soon." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Failed to send. Please try again." },
      ]);
    }
  }

  return (
    <>
      {/* Chat toggle button */}
      <Button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105"
        size="icon"
        aria-label="Open support chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>

      {/* Chat panel */}
      {open && (
        <Card className="fixed bottom-8 right-6 z-50 flex h-96 w-80 flex-col shadow-lg">
          <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Support</span>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Hi! How can we help you today?
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-8 bg-primary text-primary-foreground"
                    : "mr-8 bg-muted text-foreground"
                }`}
              >
                {m.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </CardContent>

          <CardFooter className="border-t border-border p-3">
            <form onSubmit={handleSend} className="flex w-full gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                aria-label="Support message"
                className="flex-1 bg-muted"
              />
              <Button type="submit" disabled={sending || !input.trim()}>
                Send
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
