export interface Env {
  SESSIONS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  TOKEN_SECRET_HEX: string;
  ENVIRONMENT?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// PASETO v4.local–compatible token via Web Crypto (AES-GCM)
async function importKey(secretHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(secretHex.padEnd(64, "0").slice(0, 64));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + (4 - (str.length % 4)) % 4, "=");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function issueToken(payload: Record<string, unknown>, secretHex: string): Promise<string> {
  const key = await importKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `v4.local.${base64url(iv.buffer)}.${base64url(encrypted)}`;
}

async function verifyToken(token: string, secretHex: string): Promise<Record<string, unknown> | null> {
  if (!token.startsWith("v4.local.")) return null;
  const parts = token.slice("v4.local.".length).split(".");
  if (parts.length !== 2) return null;
  try {
    const key = await importKey(secretHex);
    const iv = new Uint8Array(base64urlDecode(parts[0]));
    const ciphertext = base64urlDecode(parts[1]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function checkRateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  const kvKey = `rl:${key}`;
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs);
  const fullKey = `${kvKey}:${windowKey}`;

  const current = await env.RATE_LIMIT.get(fullKey);
  const count = current ? parseInt(current) + 1 : 1;
  if (count > limit) return false;

  await env.RATE_LIMIT.put(fullKey, String(count), { expirationTtl: Math.ceil(windowMs / 1000) + 1 });
  return true;
}

async function storeSession(env: Env, sessionId: string, data: object, ttlSeconds: number): Promise<void> {
  await env.SESSIONS.put(sessionId, JSON.stringify(data), { expirationTtl: ttlSeconds });
}

async function getSession(env: Env, sessionId: string): Promise<object | null> {
  const val = await env.SESSIONS.get(sessionId);
  return val ? JSON.parse(val) : null;
}

async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.SESSIONS.delete(sessionId);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const allowed = await checkRateLimit(env, ip, 60, 60_000);
    if (!allowed) return jsonResponse({ error: "rate_limit_exceeded" }, 429);

    try {
      const { pathname } = url;

      if (pathname === "/health" && request.method === "GET") {
        return jsonResponse({ status: "ok", runtime: "cloudflare-workers", env: env.ENVIRONMENT ?? "production" });
      }

      if (pathname === "/auth/token/verify" && request.method === "POST") {
        const { token } = await request.json() as { token: string };
        const payload = await verifyToken(token, env.TOKEN_SECRET_HEX);
        return payload
          ? jsonResponse({ valid: true, payload })
          : jsonResponse({ valid: false }, 401);
      }

      if (pathname === "/auth/session" && request.method === "GET") {
        const token = (request.headers.get("Authorization") ?? "").replace("Bearer ", "");
        const payload = await verifyToken(token, env.TOKEN_SECRET_HEX);
        if (!payload) return jsonResponse({ error: "unauthorized" }, 401);
        const session = await getSession(env, payload.sid as string);
        return jsonResponse({ session, payload });
      }

      if (pathname === "/auth/session/revoke" && request.method === "POST") {
        const token = (request.headers.get("Authorization") ?? "").replace("Bearer ", "");
        const payload = await verifyToken(token, env.TOKEN_SECRET_HEX);
        if (!payload) return jsonResponse({ error: "unauthorized" }, 401);
        await deleteSession(env, payload.sid as string);
        return jsonResponse({ revoked: true });
      }

      // Metrics endpoint
      if (pathname === "/metrics" && request.method === "GET") {
        return new Response("# ZeroAuth Edge Worker\n# No local metrics in edge mode — use Cloudflare Analytics\n", {
          headers: { "Content-Type": "text/plain; version=0.0.4", ...CORS_HEADERS },
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    } catch {
      return jsonResponse({ error: "internal_server_error" }, 500);
    }
  },
};
