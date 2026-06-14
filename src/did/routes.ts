import { Hono } from "hono";
import type { HonoEnv } from "../shared/types";
import { createDIDChallenge, verifyDIDProof } from "./verifier";
import { resolveDID } from "./resolver";

const app = new Hono<HonoEnv>();

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
  const body = await c.req.json<{ did?: unknown }>().catch(() => ({}) as { did?: unknown });
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
// Returns the verification result only. Provisioning a local user / issuing a
// ZeroAuth session from a verified DID is intentionally NOT done here: the users
// table has no `did` column yet and `provisionDIDUser()` is still a stub, so
// login-via-DID is deferred to a follow-up that adds the schema + a Drizzle-backed
// upsert. This endpoint is a sound, self-contained proof-of-control verifier.
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
    challengeId as string
  );

  if (!result.verified) {
    return c.json({ verified: false, reason: result.reason }, 401);
  }

  return c.json({ verified: true, did: result.did, method: result.method });
});

export default app;
