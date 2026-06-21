"use client";

import { useEffect } from "react";
import { brand } from "@/config/brand";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * Embeds a third-party live-chat widget (Crisp / Intercom / Tawk.to) when one is
 * configured via `NEXT_PUBLIC_CHAT_PROVIDER` + `NEXT_PUBLIC_CHAT_ID`. With no
 * provider set it renders nothing — a graceful no-op, mirroring the optional
 * web-push setup. The signed-in user's name/email is passed to the provider so
 * agents have context; failures are swallowed so chat never breaks the app.
 */
export default function LiveChatWidget() {
  const { chatProvider, chatId } = brand;

  useEffect(() => {
    if (chatProvider === "none" || !chatId) return;
    if (typeof document === "undefined") return;
    // Guard against double-injection (route changes, fast refresh).
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
        // chatId is "<propertyId>/<widgetId>"
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
