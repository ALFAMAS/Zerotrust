import { Router } from "express";
import { createDIDChallenge, verifyDIDProof, provisionDIDUser } from "./verifier";
import { resolveDID } from "./resolver";
import { TokenService } from "../services/token.service";
import { getConfig } from "../config";

const router = Router();

router.post("/challenge", async (req, res) => {
  const { did } = req.body;
  if (!did || typeof did !== "string") return res.status(400).json({ error: "did_required" });

  const domain = req.hostname;
  try {
    const doc = await resolveDID(did);
    if (!doc) return res.status(400).json({ error: "did_resolution_failed" });
    const ch = createDIDChallenge(did, domain);
    res.json({ challengeId: ch.id, challenge: ch.challenge, domain: ch.domain, expiresAt: ch.expiresAt });
  } catch (err) {
    res.status(400).json({ error: "did_resolution_failed", detail: (err as Error).message });
  }
});

router.post("/verify", async (req, res) => {
  const { challengeId, proof } = req.body;
  if (!challengeId || !proof) return res.status(400).json({ error: "challengeId and proof required" });

  const result = await verifyDIDProof(proof, challengeId);
  if (!result.verified) return res.status(401).json({ error: "did_verification_failed", reason: result.reason });

  try {
    const doc = await resolveDID(result.did!);
    const userId = await provisionDIDUser(result.did!, doc!);
    const config = getConfig();
    const tokenSvc = new TokenService(config);
    const { accessToken, refreshToken } = await tokenSvc.issueTokenPair(userId, {
      authMethod: "did",
      did: result.did,
    });
    res.json({ accessToken, refreshToken, did: result.did });
  } catch (err) {
    res.status(500).json({ error: "token_issuance_failed" });
  }
});

export default router;
