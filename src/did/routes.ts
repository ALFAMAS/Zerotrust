import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { getConfig } from "../config";
import { getDb } from "../db";
import { refreshTokensTable, sessionsTable, usersTable } from "../db/schema";
import { rateLimit } from "../middleware/rateLimiting";
import { TokenService } from "../services/token.service";
import { getClientIp } from "../shared/clientIp";
import type { HonoEnv } from "../shared/types";
import { resolveDID } from "./resolver";
import {
  createDIDChallenge,
  provisionDIDUser,
  verifyDIDProof,
} from "./verifier";

const app = new Hono<HonoEnv>();

// ─── Session issuance ─────────────────────────────────────────────────────────
// Mirrors the passwordless session-issuance flow in magic-link.routes.ts: sign
// an access token, persist a session + hashed refresh token, and hand both
// tokens back to the caller.
let _tokenService: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (_tokenService) return _tokenService;
  const cfg = getConfig();
  _tokenService = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await _tokenService.init();
  return _tokenService;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueDIDSession(userId: string, c: Context<HonoEnv>) {
  const cfg = getConfig();
  const tokenSvc = await getTokenService();
  const db = getDb();

  const userRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const sessionId = crypto.randomUUID();
  const accessToken = await tokenSvc.signAccessToken({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    aud: "zerotrust",
    scope: ["openid"],
  });
  const payload = await tokenSvc.verifyAccessToken(accessToken);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      userId: user.id,
      tokenId: payload.jti,
      deviceFingerprint: {},
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") || "",
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    })
    .returning();

  const refreshTokenPlain = await tokenSvc.signRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    sessionId: session.id,
    tokenHash: hashToken(refreshTokenPlain),
    expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
  });

  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    expiresIn: cfg.session.defaultTTL,
  };
}

// GET /resolve?did=... — resolve a DID to its DID document.
//
// Surfaces the did:key + did:web resolver. Useful on its own (e.g. verifying an
// organization's did:web before trusting it) and as the first step of the
// challenge/verify flow.
app.get("/resolve", async (c) => {
  const did = c.req.query("did");
  if (!did) return c.json({ error: "did_required" }, 400);

  const doc = await resolveDID(did);
  if (!doc) return c.json({ error: "did_resolution_failed" }, 400);
  return c.json({ did, didDocument: doc });
});

// POST /challenge — create a DID auth challenge.
//
// The caller proves control of `did` by signing the returned challenge with the
// key in the DID document's `authentication` set.
app.post("/challenge", async (c) => {
  const body = await c.req
    .json<{ did?: unknown }>()
    .catch(() => ({}) as { did?: unknown });
  const { did } = body;

  if (!did || typeof did !== "string") {
    return c.json({ error: "did_required" }, 400);
  }

  const domain = new URL(c.req.url).hostname;

  const doc = await resolveDID(did);
  if (!doc) return c.json({ error: "did_resolution_failed" }, 400);

  const ch = createDIDChallenge(did, domain);
  return c.json({
    challengeId: ch.id,
    challenge: ch.challenge,
    domain: ch.domain,
    expiresAt: ch.expiresAt,
  });
});

// POST /verify — verify a signed DID proof against a challenge.
//
// Returns the verification result only (proof-of-control). It does NOT create a
// user or issue a session — that is `POST /login` below. Keeping `/verify` pure
// makes it usable on its own (e.g. verifying an org's did:web) and keeps it
// DB-free.
app.post("/verify", async (c) => {
  const body = await c.req
    .json<{ challengeId?: unknown; proof?: unknown }>()
    .catch(() => ({}) as { challengeId?: unknown; proof?: unknown });
  const { challengeId, proof } = body;

  if (!challengeId || !proof) {
    return c.json({ error: "challengeId and proof required" }, 400);
  }

  const result = await verifyDIDProof(
    proof as Parameters<typeof verifyDIDProof>[0],
    challengeId as string,
  );

  if (!result.verified) {
    return c.json({ verified: false, reason: result.reason }, 401);
  }

  return c.json({ verified: true, did: result.did, method: result.method });
});

// POST /login — verify a signed DID proof, then provision a local user and issue
// a zerotrust session. This is the login-via-DID entry point: it runs the same
// proof-of-control check as /verify, find-or-creates a user keyed on the DID,
// and returns access + refresh tokens.
app.post("/login", rateLimit({ points: 10, windowSecs: 60 }), async (c) => {
  const body = await c.req
    .json<{ challengeId?: unknown; proof?: unknown }>()
    .catch(() => ({}) as { challengeId?: unknown; proof?: unknown });
  const { challengeId, proof } = body;

  if (!challengeId || !proof) {
    return c.json({ error: "challengeId and proof required" }, 400);
  }

  const result = await verifyDIDProof(
    proof as Parameters<typeof verifyDIDProof>[0],
    challengeId as string,
  );

  if (!result.verified || !result.did) {
    return c.json({ verified: false, reason: result.reason }, 401);
  }

  try {
    // verifyDIDProof already resolved + validated the document; re-resolve for the
    // provisioning record (provisionDIDUser keys solely on the DID string).
    const didDoc = await resolveDID(result.did);
    const userId = await provisionDIDUser(
      result.did,
      didDoc as import("./types").DIDDocument,
    );
    const tokens = await issueDIDSession(userId, c);
    return c.json({
      verified: true,
      did: result.did,
      method: result.method,
      ...tokens,
    });
  } catch {
    return c.json({ error: "did_login_failed" }, 500);
  }
});

export default app;
