/**
 * MCP Authorization Server
 *
 * Implements the MCP auth spec (draft) on top of the existing OIDC provider.
 * MCP clients obtain scoped tokens via the OAuth 2.0 device authorization flow,
 * scoped to specific tools/resources the agent is allowed to access.
 *
 * Endpoints:
 *   POST /mcp/auth          — exchange credentials for an MCP-scoped token
 *   GET  /mcp/.well-known/oauth-authorization-server — discovery document
 *   POST /mcp/token         — token exchange (RFC 8693) for delegation
 */

import { Hono } from "hono";
import { z } from "zod";
import { getConfig } from "../../config/index.js";
import { getLogger } from "../../logger/index.js";
import { rateLimit } from "../../middleware/rateLimiting.js";
import { principalFromToken } from "../../shared/principal.js";
import type { HonoEnv } from "../../shared/types.js";
import { ErrorCodes, zerotrustError } from "../../shared/types.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("mcp-auth");

function allowedMcpRedirectOrigins(): Set<string> {
  const raw = process.env.MCP_REDIRECT_ORIGINS ?? process.env.APP_URL ?? "http://localhost:3000";
  const origins = new Set<string>();
  for (const entry of raw.split(",")) {
    try {
      const parsed = new URL(entry.trim());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") origins.add(parsed.origin);
    } catch {
      // Ignore malformed operator config entries.
    }
  }
  return origins;
}

function safeMcpRedirectBase(input: string | undefined): string | null {
  const fallback = process.env.APP_URL ?? "http://localhost:3000";
  try {
    const parsed = new URL(input ?? fallback);
    if (!allowedMcpRedirectOrigins().has(parsed.origin)) return null;
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// ── Discovery ─────────────────────────────────────────────────────────────────

router.get("/.well-known/oauth-authorization-server", (c) => {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/mcp/authorize`,
    token_endpoint: `${base}/mcp/token`,
    grant_types_supported: [
      "authorization_code",
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    response_types_supported: ["code"],
    scopes_supported: ["mcp:tools", "mcp:resources", "mcp:prompts", "openid", "profile"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
  });
});

// ── Authorization (code flow for device-based MCP clients) ────────────────────

const authorizeSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().default("mcp:tools"),
  response_type: z.literal("code").default("code"),
  redirect_uri: z.string().url().optional(),
  state: z.string().optional(),
});

router.post("/authorize", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = authorizeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", message: parsed.error.issues[0]?.message }, 400);
  }

  // Validate client credentials against registered MCP clients
  const mcpSecret = process.env.MCP_CLIENT_SECRET;
  if (!mcpSecret || parsed.data.client_secret !== mcpSecret) {
    return c.json({ error: "invalid_client", message: "Invalid client credentials" }, 401);
  }

  const redirectBase = safeMcpRedirectBase(parsed.data.redirect_uri);
  if (!redirectBase) {
    return c.json({ error: "invalid_request", message: "redirect_uri is not allowed" }, 400);
  }

  // Issue a short-lived authorization code
  const code = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

  // Store code in memory (in production use Redis with TTL)
  mcpAuthCodes.set(code, {
    clientId: parsed.data.client_id,
    scope: parsed.data.scope,
    redirectUri: parsed.data.redirect_uri,
    state: parsed.data.state,
    expiresAt,
  });

  const params = new URLSearchParams({ code });
  if (parsed.data.state) params.set("state", parsed.data.state);

  return c.json({
    authorization_code: code,
    expires_in: 300,
    redirect_to: `${redirectBase}/mcp/callback?${params.toString()}`,
  });
});

// ── Token endpoint ────────────────────────────────────────────────────────────

const tokenSchema = z.object({
  grant_type: z.enum(["authorization_code", "urn:ietf:params:oauth:grant-type:token-exchange"]),
  code: z.string().min(1).optional(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  subject_token: z.string().min(1).optional(), // for RFC 8693 exchange
  subject_token_type: z
    .literal("urn:ietf:params:oauth:token-type:access_token")
    .default("urn:ietf:params:oauth:token-type:access_token"),
  requested_token_type: z
    .literal("urn:ietf:params:oauth:token-type:access_token")
    .default("urn:ietf:params:oauth:token-type:access_token"),
  actor_token: z.string().optional(), // act-as delegation
  actor_token_type: z
    .literal("urn:ietf:params:oauth:token-type:access_token")
    .default("urn:ietf:params:oauth:token-type:access_token"),
  resource: z.string().optional(), // target MCP server
  scope: z.string().default("mcp:tools"),
});

router.post("/token", rateLimit({ points: 30, windowSecs: 60 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", message: parsed.error.issues[0]?.message }, 400);
  }

  // Validate client
  const mcpSecret = process.env.MCP_CLIENT_SECRET;
  if (!mcpSecret || parsed.data.client_secret !== mcpSecret) {
    return c.json({ error: "invalid_client", message: "Invalid client credentials" }, 401);
  }

  const cfg = getConfig();
  const { TokenService } = await import("../../services/token.service.js");
  const svc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await svc.init();

  if (parsed.data.grant_type === "authorization_code") {
    // Exchange authorization code for MCP token
    const codeEntry = mcpAuthCodes.get(parsed.data.code ?? "");
    if (!codeEntry || codeEntry.expiresAt < Date.now()) {
      return c.json(
        {
          error: "invalid_grant",
          message: "Authorization code expired or invalid",
        },
        400
      );
    }
    mcpAuthCodes.delete(parsed.data.code ?? "");

    // Determine subject — if actor_token present, this is a delegation
    let subjectId = codeEntry.clientId;
    let actAs: string[] | undefined;
    let workloadId: string | undefined;

    if (parsed.data.actor_token) {
      try {
        const actorPayload = await svc.verifyAccessToken(parsed.data.actor_token);
        actAs = [actorPayload.sub];
        subjectId = actorPayload.sub;
        workloadId = codeEntry.clientId;
      } catch {
        return c.json({ error: "invalid_grant", message: "Invalid actor token" }, 400);
      }
    }

    const scopes = parsed.data.scope.split(" ");
    const sessionId = crypto.randomUUID();
    const accessToken = await svc.signAccessToken({
      sub: subjectId,
      sid: sessionId,
      aud: "mcp",
      scope: scopes,
      principal_type: "agent",
      workload_id: workloadId,
      ...(actAs && actAs.length > 0 ? { act_as: actAs } : {}),
    });

    logger.info("MCP token issued", {
      client: parsed.data.client_id,
      scope: parsed.data.scope,
      act_as: actAs,
    });

    return c.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: cfg.session.defaultTTL,
      scope: parsed.data.scope,
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    });
  }

  // RFC 8693 token exchange
  if (!parsed.data.subject_token) {
    return c.json(
      {
        error: "invalid_request",
        message: "subject_token required for exchange",
      },
      400
    );
  }

  try {
    const subjectPayload = await svc.verifyAccessToken(parsed.data.subject_token);
    const scopes = parsed.data.scope.split(" ");
    const sessionId = crypto.randomUUID();

    const accessToken = await svc.signAccessToken({
      sub: subjectPayload.sub,
      sid: sessionId,
      aud: "mcp",
      scope: scopes,
      ...(subjectPayload.principal_type ? { principal_type: subjectPayload.principal_type } : {}),
      ...(subjectPayload.workload_id ? { workload_id: subjectPayload.workload_id } : {}),
      ...(subjectPayload.act_as ? { act_as: subjectPayload.act_as } : {}),
    });

    logger.info("MCP token exchanged", {
      subject: subjectPayload.sub,
      scope: parsed.data.scope,
    });

    return c.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: cfg.session.defaultTTL,
      scope: parsed.data.scope,
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    });
  } catch {
    return c.json({ error: "invalid_grant", message: "Invalid subject token" }, 400);
  }
});

// ── Auth guard for MCP-protected resources ────────────────────────────────────

export function mcpAuthMiddleware(requiredScope?: string) {
  return async (c: any, next: any) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new zerotrustError(ErrorCodes.TOKEN_INVALID, "Missing bearer token", 401);
    }

    const token = authHeader.slice(7);
    const cfg = getConfig();
    const { TokenService } = await import("../../services/token.service.js");
    const svc = new TokenService(cfg.security.tokenSecretHex, cfg.session);
    await svc.init();

    try {
      const payload = await svc.verifyAccessToken(token);
      if (payload.aud !== "mcp") {
        throw new zerotrustError(ErrorCodes.TOKEN_INVALID, "Token not intended for MCP", 401);
      }
      if (requiredScope && !payload.scope?.includes(requiredScope)) {
        throw new zerotrustError(
          ErrorCodes.INSUFFICIENT_PRIVILEGE,
          `Missing scope: ${requiredScope}`,
          403
        );
      }
      c.set("mcpPrincipal", principalFromToken(payload));
      c.set("mcpToken", payload);
    } catch (err) {
      if (err instanceof zerotrustError) throw err;
      throw new zerotrustError(ErrorCodes.TOKEN_INVALID, "Invalid MCP token", 401);
    }

    return next();
  };
}

// ── In-memory code store (replace with Redis in production) ───────────────────

const mcpAuthCodes = new Map<
  string,
  {
    clientId: string;
    scope: string;
    redirectUri?: string;
    state?: string;
    expiresAt: number;
  }
>();

export default router;
