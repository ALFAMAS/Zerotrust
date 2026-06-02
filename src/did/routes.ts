import { Hono } from "hono";
import type { HonoEnv } from "../shared/types";
import { createDIDChallenge, verifyDIDProof, provisionDIDUser } from "./verifier";
import { resolveDID } from "./resolver";
import { TokenService } from "../services/token.service";
import { getConfig } from "../config";

const app = new Hono<HonoEnv>();

// POST /challenge — create a DID auth challenge
app.post("/challenge", async (c) => {
  const body = await c.req.json<{ did?: unknown }>();
  const { did } = body;

  if (!did || typeof did !== "string") {
    return c.json({ error: "did_required" }, 400);
  }

  const domain = new URL(c.req.url).hostname;

  try {
    const doc = await resolveDID(did);
    if (!doc) return c.json({ error: "did_resolution_failed" }, 400);

    const ch = createDIDChallenge(did, domain);
    return c.json({
      challengeId: ch.id,
      challenge: ch.challenge,
      domain: ch.domain,
      expiresAt: ch.expiresAt,
    });
  } catch (err) {
    return c.json({ error: "did_resolution_failed", detail: (err as Error).message }, 400);
  }
});

// POST /verify — verify a DID proof and issue tokens
app.post("/verify", async (c) => {
  const body = await c.req.json<{ challengeId?: unknown; proof?: unknown }>();
  const { challengeId, proof } = body;

  if (!challengeId || !proof) {
    return c.json({ error: "challengeId and proof required" }, 400);
  }

  const result = await verifyDIDProof(
    proof as Parameters<typeof verifyDIDProof>[0],
    challengeId as string
  );

  if (!result.verified) {
    return c.json({ error: "did_verification_failed", reason: result.reason }, 401);
  }

  try {
    const doc = await resolveDID(result.did!);
    const userId = await provisionDIDUser(result.did!, doc!);
    const config = getConfig();
    const tokenSvc = new TokenService(config.security.tokenSecretHex, config.session);
    await tokenSvc.init();
    const accessToken = await tokenSvc.signAccessToken({
      sub: userId,
      email: "",
      sid: "",
      aud: "zeroauth",
      iss: "zeroauth",
    });
    const refreshToken = await tokenSvc.signRefreshToken();
    return c.json({ accessToken, refreshToken, did: result.did });
  } catch {
    return c.json({ error: "token_issuance_failed" }, 500);
  }
});

// POST /provision — provision a DID user
app.post("/provision", async (c) => {
  const body = await c.req.json<{ did?: unknown }>();
  const { did } = body;

  if (!did || typeof did !== "string") {
    return c.json({ error: "did_required" }, 400);
  }

  try {
    const doc = await resolveDID(did);
    if (!doc) return c.json({ error: "did_resolution_failed" }, 400);

    const userId = await provisionDIDUser(did, doc);
    return c.json({ userId, did });
  } catch (err) {
    return c.json({ error: "provision_failed", detail: (err as Error).message }, 500);
  }
});

export default app;
