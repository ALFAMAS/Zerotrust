import * as nodeCrypto from "node:crypto";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { getConfig } from "../../config";
import { getDb } from "../../db";
import { refreshTokensTable, sessionsTable, usersTable } from "../../db/schema";
import { setRefreshTokenCookie } from "../../shared/authCookies";
import { enforceMaxConcurrentDevices } from "../../middleware/sessionControl";
import { FingerprintService } from "./fingerprint.service";
import { notifyIfNewDevice } from "./loginNotification.service";
import { TokenService } from "./token.service";
import { getClientIp } from "../../shared/clientIp";
import type { HonoEnv } from "../../shared/types";

let tokenServiceInstance: TokenService | null = null;

async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

function hashToken(token: string) {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

export async function issueAuthenticatedSession(
  c: Context<HonoEnv>,
  user: { id: string; email: string; displayName?: string | null }
) {
  const cfg = getConfig();
  const tokenSvc = await getTokenService();
  const db = getDb();

  const fpInput = FingerprintService.extractFromRequest({
    headers: Object.fromEntries(c.req.raw.headers),
    ip: getClientIp(c),
  });
  const fingerprint = FingerprintService.compute(fpInput);

  const popKey = c.req.header("x-pop-key") || undefined;
  const sessionId = nodeCrypto.randomUUID();

  const accessToken = await tokenSvc.signAccessToken({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    aud: "zerotrust",
    scope: ["openid"],
    pop_key: popKey,
  });
  const payload = await tokenSvc.verifyAccessToken(accessToken);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      id: sessionId,
      userId: user.id,
      tokenId: payload.jti,
      deviceFingerprint: {
        ...fingerprint,
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: fpInput.ip,
      country: c.get("inferredCountry") || undefined,
      userAgent: c.req.header("user-agent"),
      expiresAt: new Date(payload.exp * 1000),
      lastActivityAt: new Date(),
      isActive: true,
      proofOfPossessionKey: payload.pop_key,
    })
    .returning();

  const refreshTokenPlain = await tokenSvc.signRefreshToken();
  const refreshTokenHash = hashToken(refreshTokenPlain);
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    sessionId: session.id,
    tokenHash: refreshTokenHash,
    expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
  });

  await enforceMaxConcurrentDevices(user.id);

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  void notifyIfNewDevice({
    userId: user.id,
    email: user.email,
    displayName: user.displayName ?? user.email,
    sessionId: session.id,
    fingerprintHash: fingerprint.hash,
    ipAddress: fpInput.ip,
    country: c.get("inferredCountry") || undefined,
    userAgent: c.req.header("user-agent"),
  });

  setRefreshTokenCookie(c, refreshTokenPlain, cfg.session.refreshTokenTTL);

  return {
    body: {
      accessToken,
      expiresIn: cfg.session.defaultTTL,
      tokenType: "Bearer",
    },
    refreshTokenPlain,
    sessionId: session.id,
  };
}
