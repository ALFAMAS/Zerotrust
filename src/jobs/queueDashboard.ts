import { randomBytes } from "node:crypto";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Queue } from "bullmq";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
import { BULLMQ_QUEUE_NAMES, parseRedisConnection } from "./queueConfig";

export function isQueueDashboardEnabled(
  env: { NODE_ENV?: string; QUEUE_DASHBOARD_ENABLED?: string } = process.env
): boolean {
  return env.NODE_ENV !== "production" || env.QUEUE_DASHBOARD_ENABLED === "true";
}

export function addQueueDashboardNonce(html: string, nonce: string): string {
  return html
    .replace('<script id="__UI_CONFIG__"', `<script nonce="${nonce}" id="__UI_CONFIG__"`)
    .replace("<style>", `<style nonce="${nonce}">`);
}

export function buildQueueDashboardCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // Bull Board uses CSS-in-JS and inline loading styles; scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const queueDashboardSecurity = createMiddleware<HonoEnv>(async (c, next) => {
  await next();
  if (!c.res.headers.get("content-type")?.includes("text/html")) return;

  const nonce = randomBytes(16).toString("base64url");
  const html = addQueueDashboardNonce(await c.res.text(), nonce);
  const headers = new Headers(c.res.headers);
  headers.set("Content-Security-Policy", buildQueueDashboardCsp(nonce));
  c.res = new Response(html, { status: c.res.status, statusText: c.res.statusText, headers });
});

export function createQueueDashboard(redisUri: string) {
  const connection = parseRedisConnection(redisUri);
  if (!connection) return null;

  const queues = BULLMQ_QUEUE_NAMES.map(
    (name) => new Queue(name, { connection: { ...connection, lazyConnect: true } })
  );
  const serverAdapter = new HonoAdapter(serveStatic).setBasePath("/admin/queues");

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
    options: { uiConfig: { boardTitle: "zerotrust queues" } },
  });

  return {
    app: serverAdapter.registerPlugin(),
    close: () => Promise.all(queues.map((queue) => queue.close())),
  };
}
