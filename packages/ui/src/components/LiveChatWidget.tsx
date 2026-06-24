"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/config/brand";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

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

  useEffect(() => {
    if (chatProvider === "none" || !chatId) return;
    if (typeof document === "undefined") return;
    if (document.getElementById("zeroauth-livechat")) return;

    let cancelled = false;

    async function getIdentity(): Promise<{ name?: string; email?: string }> {
      if (!getToken()) return {};
      try {
        const me = await api.get<{ displayName?: string; email?: string }>("/auth/me");
        return { name: me.displayName, email: me.email };
      } catch {
        return {};
      }
    }

    function inject(identity: { name?: string; email?: string }) {
      if (cancelled) return;
      const w = window as any;

      if (chatProvider === "crisp") {
        w.$crisp = w.$crisp || [];
        w.CRISP_WEBSITE_ID = chatId;
        if (identity.email) w.$crisp.push(["set", "user:email", [identity.email]]);
        if (identity.name) w.$crisp.push(["set", "user:nickname", [identity.name]]);
        const s = document.createElement("script");
        s.id = "zeroauth-livechat";
        s.src = "https://client.crisp.chat/l.js";
        s.async = true;
        document.head.appendChild(s);
      } else if (chatProvider === "intercom") {
        w.intercomSettings = { app_id: chatId, name: identity.name, email: identity.email };
        const s = document.createElement("script");
        s.id = "zeroauth-livechat";
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
        s.id = "zeroauth-livechat";
        s.async = true;
        s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
        s.charset = "UTF-8";
        s.setAttribute("crossorigin", "*");
        document.head.appendChild(s);
      }
    }

    getIdentity().then(inject);
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/** Native chat widget — creates support tickets via the API */
function NativeChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "system"; text: string }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      if (!ticketId) {
        // Create a new support ticket
        const res = await api.post<{ ticket: { id: string } }>("/support/tickets", {
          subject: text.slice(0, 80),
          body: text,
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
        // Add message to existing ticket
        await api.post(`/support/tickets/${ticketId}/messages`, { body: text });
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
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Chat toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Open support chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-96 w-80 flex-col rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Support</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          </div>

          <form onSubmit={handleSend} className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
